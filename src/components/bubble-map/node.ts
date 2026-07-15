import { Circle, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { SimulationNodeDatum } from "d3-force";
import type { GameBubbleData } from "@/lib/types";
import { formatPlayers } from "@/lib/format";
import { COLOR_DISCOUNT, FILL_ALPHA } from "./colors";
import {
  HOVER_SCALE,
  LOD_CHANGE_MIN_R,
  LOD_NAME_MIN_R,
  RADIUS_LERP,
} from "./constants";

export interface BubbleSimNode extends SimulationNodeDatum {
  appid: number;
  // forceCollide는 이 목표 반경을 즉시 사용 — 시각 반경(BubbleNode.r)은 여기로 lerp
  targetR: number;
}

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif";
const TEXT_SHADOW = {
  color: 0x000000,
  alpha: 0.55,
  blur: 2,
  distance: 1,
  angle: Math.PI / 2,
};

// 반경 대비 글자수(~r/4)로 자르고 말줄임
function abbreviate(name: string, r: number): string {
  const max = Math.max(3, Math.floor(r / 4));
  return name.length <= max ? name : `${name.slice(0, Math.max(2, max - 1))}…`;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

interface Badge {
  root: Container;
  bg: Graphics;
  label: Text;
  shown: number;
}

// 버블 1개의 표시 상태 — Graphics/Text 재생성 없이 dirty 시에만 다시 그린다
export class BubbleNode {
  readonly sim: BubbleSimNode;
  readonly container: Container;
  game: GameBubbleData;

  private readonly gfx: Graphics;
  private readonly hit: Circle;
  private art: Sprite | null = null;
  private nameText: Text | null = null;
  private changeText: Text | null = null;
  private badge: Badge | null = null;

  private r: number; // 시각 반경 (sim.targetR로 lerp)
  private color: number;
  private optShowName: boolean;
  private optShowChange: boolean;
  private hovered = false;
  private gfxDirty = true;
  private dead = false;
  // Text 재래스터 방지 캐시
  private nameShown = "";
  private nameFs = 0;
  private changeShown = "";
  private changeFs = 0;

  constructor(
    game: GameBubbleData,
    x: number,
    y: number,
    targetR: number,
    color: number,
    showName: boolean,
    showChange: boolean,
    onTap: (game: GameBubbleData) => void,
  ) {
    this.game = game;
    this.sim = { appid: game.appid, targetR, x, y, vx: 0, vy: 0 };
    this.r = Math.max(4, targetR * 0.3); // 등장 애니메이션 시작 반경
    this.color = color;
    this.optShowName = showName;
    this.optShowChange = showChange;

    this.container = new Container();
    this.container.position.set(x, y);
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);

    this.hit = new Circle(0, 0, this.r);
    this.container.hitArea = this.hit;
    // dynamic: 커서가 멈춰 있어도 버블이 요동으로 커서 밑을 드나들 때 hover 동기화 (CLAUDE.md 5-1 상시 유동)
    // 탭=선택(Pixi pointertap, 검증됨) / 드래그=버블 이동(엔진 네이티브 포인터)로 분리
    this.container.eventMode = "dynamic";
    this.container.cursor = "pointer";
    this.container.on("pointerover", () => this.setHovered(true));
    this.container.on("pointerout", () => this.setHovered(false));
    this.container.on("pointertap", () => onTap(this.game));

    this.updateBadge();
  }

  // 히트 테스트용 현재 시각 반경 (월드 좌표계)
  get radius(): number {
    return this.r;
  }

  get isDead(): boolean {
    return this.dead;
  }

  // prop 갱신 diff 반영 — 실제 변경이 있을 때만 dirty
  setData(
    game: GameBubbleData,
    color: number,
    showName: boolean,
    showChange: boolean,
  ): void {
    const prev = this.game;
    const prevDiscount = prev.price?.discountPct ?? 0;
    const nextDiscount = game.price?.discountPct ?? 0;
    this.game = game;
    if (
      color !== this.color ||
      showName !== this.optShowName ||
      showChange !== this.optShowChange ||
      game.name !== prev.name ||
      game.players !== prev.players ||
      game.sharePct !== prev.sharePct ||
      nextDiscount !== prevDiscount
    ) {
      this.gfxDirty = true;
    }
    this.color = color;
    this.optShowName = showName;
    this.optShowChange = showChange;
    if (nextDiscount !== prevDiscount) this.updateBadge();
  }

  setTargetR(target: number): void {
    if (Math.abs(this.sim.targetR - target) > 0.1) {
      this.sim.targetR = target;
      this.gfxDirty = true;
    }
  }

  // 텍스처 지연 도착 — 노드가 살아 있으면 부착 (텍스처는 공유 캐시 소유)
  setTexture(tex: Texture): void {
    if (this.dead) return;
    if (!this.art) {
      this.art = new Sprite(tex);
      this.art.anchor.set(0.5);
      this.container.addChildAt(this.art, 1); // gfx 위, 텍스트 아래
    } else {
      this.art.texture = tex;
    }
    this.gfxDirty = true;
  }

  // 매 프레임: 반경/호버 스케일 lerp + dirty 시에만 redraw + 시뮬레이션 좌표 동기
  frame(): void {
    if (this.dead) return;
    const tr = this.sim.targetR;
    if (this.r !== tr) {
      const next = this.r + (tr - this.r) * RADIUS_LERP;
      this.r = Math.abs(next - tr) < 0.15 ? tr : next;
      this.gfxDirty = true;
    }
    const targetScale = this.hovered ? HOVER_SCALE : 1;
    const s = this.container.scale.x;
    if (s !== targetScale) {
      const ns = s + (targetScale - s) * 0.2;
      this.container.scale.set(Math.abs(ns - targetScale) < 0.002 ? targetScale : ns);
    }
    if (this.gfxDirty) {
      this.gfxDirty = false;
      this.redraw();
    }
    this.container.position.set(this.sim.x ?? 0, this.sim.y ?? 0);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.container.removeAllListeners();
    this.container.destroy({ children: true }); // 공유 텍스처는 파괴하지 않음(기본값)
  }

  // 엔진 전체 파괴 경로 — 표시 객체는 app.destroy(children)가 정리하므로 플래그만
  markDead(): void {
    this.dead = true;
  }

  private setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.container.zIndex = hovered ? 100 : 0; // 호버 시 앞으로
    if (this.badge) {
      this.badge.root.visible = hovered && (this.game.price?.discountPct ?? 0) > 0;
    }
  }

  private redraw(): void {
    const r = this.r;
    const g = this.gfx;
    const discount = this.game.price?.discountPct ?? 0;

    g.clear();
    g.circle(0, 0, r)
      .fill({ color: this.color, alpha: FILL_ALPHA })
      .stroke({ color: this.color, width: 2 });
    if (discount > 0) {
      // 할인 링 — 버블 바로 바깥 노란 테두리 (CLAUDE.md 5-1 차별점)
      g.circle(0, 0, r + 3).stroke({ color: COLOR_DISCOUNT, width: 2, alpha: 0.95 });
    }
    this.hit.radius = Math.max(r + (discount > 0 ? 3 : 0), 6);

    // ── LOD: r 크기·설정에 따른 내용물 (CLAUDE.md 5-1) ──
    const showName = this.optShowName && r >= LOD_NAME_MIN_R;
    const showChange = this.optShowChange && r >= LOD_CHANGE_MIN_R;

    // 아트 배치 — 텍스트 유무에 따라 상단 배치, 없으면 버블 전체 채움
    let artD: number;
    let artY: number;
    if (showName && showChange) {
      artD = r * 0.9;
      artY = -r * 0.42;
    } else if (showName) {
      artD = r * 0.95;
      artY = -r * 0.35;
    } else if (showChange) {
      artD = r;
      artY = -r * 0.32;
    } else {
      artD = Math.max((r - 1.5) * 2, 4);
      artY = 0;
    }
    if (this.art) {
      this.art.width = artD;
      this.art.height = artD;
      this.art.position.set(0, artY);
    }

    if (showName) {
      const label = abbreviate(this.game.name, r);
      const fs = clampInt(r * 0.24, 9, 20);
      if (!this.nameText) this.nameText = this.makeText();
      const t = this.nameText;
      if (this.nameShown !== label) {
        t.text = label;
        this.nameShown = label;
      }
      if (this.nameFs !== fs) {
        t.style.fontSize = fs;
        this.nameFs = fs;
      }
      t.position.set(0, r * (showChange ? 0.18 : 0.42));
      t.visible = true;
    } else if (this.nameText) {
      this.nameText.visible = false;
    }

    if (showChange) {
      // 증감% 대신 현재 동접 수 + 전체 동접 중 점유율(보는맛 있는 지표)
      const label = `${formatPlayers(this.game.players)} · ${this.game.sharePct.toFixed(1)}%`;
      const fs = clampInt(r * 0.2, 8, 16);
      if (!this.changeText) this.changeText = this.makeText();
      const t = this.changeText;
      if (this.changeShown !== label) {
        t.text = label;
        this.changeShown = label;
      }
      if (this.changeFs !== fs) {
        t.style.fontSize = fs;
        this.changeFs = fs;
      }
      t.position.set(0, r * (showName ? 0.58 : 0.5));
      t.visible = true;
    } else if (this.changeText) {
      this.changeText.visible = false;
    }

    if (this.badge) this.badge.root.position.set(0, -(r + 12));
  }

  private makeText(): Text {
    const t = new Text({
      text: "",
      style: {
        fontFamily: FONT_STACK,
        fontSize: 10,
        fontWeight: "600",
        fill: 0xffffff,
        dropShadow: TEXT_SHADOW,
      },
    });
    t.anchor.set(0.5);
    t.roundPixels = true;
    this.container.addChild(t);
    return t;
  }

  // 호버 시 노출되는 "-{pct}%" 노란 뱃지 — 할인 게임만 생성
  private updateBadge(): void {
    const discount = this.game.price?.discountPct ?? 0;
    if (discount <= 0) {
      if (this.badge) {
        this.badge.root.visible = false;
        this.badge.shown = 0;
      }
      return;
    }
    if (!this.badge) {
      const root = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: "",
        style: { fontFamily: FONT_STACK, fontSize: 11, fontWeight: "700", fill: 0x14161f },
      });
      label.anchor.set(0.5);
      root.addChild(bg, label);
      root.visible = false;
      this.container.addChild(root);
      this.badge = { root, bg, label, shown: 0 };
    }
    const b = this.badge;
    if (b.shown !== discount) {
      b.shown = discount;
      b.label.text = `-${discount}%`;
      const w = b.label.width;
      const h = b.label.height;
      b.bg
        .clear()
        .roundRect(-w / 2 - 5, -h / 2 - 2.5, w + 10, h + 5, 5)
        .fill({ color: COLOR_DISCOUNT });
    }
    b.root.visible = this.hovered;
  }
}
