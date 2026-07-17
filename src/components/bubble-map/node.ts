import {
  Circle,
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type Texture,
} from "pixi.js";
import type { SimulationNodeDatum } from "d3-force";
import type { GameBubbleData } from "@/lib/types";
import { formatPlayers } from "@/lib/format";
import { COLOR_DISCOUNT, FILL_ALPHA } from "./colors";
import {
  HOVER_SCALE,
  LOD_COUNT_MIN_R,
  LOD_NAME_MIN_R,
  LOD_RANK_MIN_R,
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
const RANK_FILL = 0xa7b4c4; // 순위는 흐린 회색 (동접 수보다 덜 강조)

// CJK 전각(한글·한자·가나·전각기호) ≈ 1em, 그 외 ≈ 0.58em 근사 폭
const CJK_RE =
  /[ᄀ-ᇿ⺀-鿿가-힣豈-﫿＀-｠　-〿]/;

function estTextWidth(text: string, fs: number): number {
  let units = 0;
  for (const ch of text) units += CJK_RE.test(ch) ? 1 : 0.58;
  return units * fs;
}

// 픽셀 폭 기준으로 자르고 말줄임 — 글자수 기준은 전각 문자에서 원 밖으로 넘쳐
// 이웃 버블에 가려진다(모바일 "문자 끊김"). 원 내부 chord 폭에 맞춘다.
function fitText(text: string, fs: number, maxW: number): string {
  if (estTextWidth(text, fs) <= maxW) return text;
  const ellipsisW = 0.7 * fs;
  let w = 0;
  let out = "";
  for (const ch of text) {
    const cw = (CJK_RE.test(ch) ? 1 : 0.58) * fs;
    if (w + cw + ellipsisW > maxW) break;
    out += ch;
    w += cw;
  }
  return out.length === 0 ? "…" : `${out.trimEnd()}…`;
}

// 줄 중심 y(r 배수)에 놓인 텍스트가 원 안에 들어가는 최대 가로 폭 (여백 6%)
function chordWidth(r: number, yFactor: number, fs: number): number {
  const yEdge = Math.abs(yFactor * r) + fs * 0.5;
  if (yEdge >= r) return r * 0.5; // 이론상 도달 불가 — 방어
  return 2 * Math.sqrt(r * r - yEdge * yEdge) * 0.94;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

// 텍스트 줄 수(0~3)별 아트 크기·위치 + 각 줄 y (모두 r 배수). 작은 버블 가독성 우선.
const LAYOUT: Record<number, { artD: number; artY: number; lineYs: number[] }> = {
  0: { artD: 1, artY: 0, lineYs: [] },
  1: { artD: 0.9, artY: -0.25, lineYs: [0.46] },
  2: { artD: 0.78, artY: -0.42, lineYs: [0.16, 0.46] },
  3: { artD: 0.66, artY: -0.5, lineYs: [0.06, 0.3, 0.54] },
};

interface TextLine {
  obj: Text | null;
  shown: string;
  fs: number;
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
  // 버블 내용물 3줄: 이름 / 현재 동접 수 / 순위 (점유율은 hover·상세에서만)
  private nameLine: TextLine = { obj: null, shown: "", fs: 0 };
  private countLine: TextLine = { obj: null, shown: "", fs: 0 };
  private rankLine: TextLine = { obj: null, shown: "", fs: 0 };
  private badge: Badge | null = null;

  private r: number; // 시각 반경 (sim.targetR로 lerp)
  private color: number;
  private optShowName: boolean;
  private optShowStats: boolean; // 동접 수·순위 표시 토글
  // 현재 월드 줌 — LOD·폰트를 화면상 반경(r×zoom) 기준으로 판정 (semantic zoom).
  // 텍스트는 1/zoom 카운터 스케일로 화면 픽셀 크기 그대로 래스터 → 줌인해도 선명
  private zoom = 1;
  private hovered = false;
  private gfxDirty = true;
  private dead = false;

  constructor(
    game: GameBubbleData,
    x: number,
    y: number,
    targetR: number,
    color: number,
    showName: boolean,
    showStats: boolean,
    hoverCapable: boolean,
    onTap: (game: GameBubbleData) => void,
    onHover: (game: GameBubbleData, hovered: boolean) => void,
  ) {
    this.game = game;
    this.sim = { appid: game.appid, targetR, x, y, vx: 0, vy: 0 };
    this.r = Math.max(4, targetR * 0.3); // 등장 애니메이션 시작 반경
    this.color = color;
    this.optShowName = showName;
    this.optShowStats = showStats;

    this.container = new Container();
    this.container.position.set(x, y);
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);

    this.hit = new Circle(0, 0, this.r);
    this.container.hitArea = this.hit;
    // dynamic: 커서가 멈춰 있어도 버블이 요동으로 커서 밑을 드나들 때 hover 동기화 (CLAUDE.md 5-1 상시 유동)
    // — hover 개념이 없는 터치 전용 기기는 static으로 매 프레임 히트테스트 비용 제거 (수백 노드 시 핀치 프레임 드랍 방지)
    // 탭=선택(Pixi pointertap) / 드래그=버블 이동(엔진 네이티브) / hover=툴팁(엔진→React) 분리
    this.container.eventMode = hoverCapable ? "dynamic" : "static";
    this.container.cursor = "pointer";
    this.container.on("pointerover", (e: FederatedPointerEvent) => {
      if (e.pointerType === "touch") return; // 터치엔 hover 없음 — 탭=모달이 대체 (툴팁 눌어붙음 방지)
      this.setHovered(true);
      onHover(this.game, true);
    });
    this.container.on("pointerout", (e: FederatedPointerEvent) => {
      if (e.pointerType === "touch") return;
      this.setHovered(false);
      onHover(this.game, false);
    });
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
    showStats: boolean,
  ): void {
    const prev = this.game;
    const prevDiscount = prev.price?.discountPct ?? 0;
    const nextDiscount = game.price?.discountPct ?? 0;
    this.game = game;
    if (
      color !== this.color ||
      showName !== this.optShowName ||
      showStats !== this.optShowStats ||
      game.name !== prev.name ||
      game.players !== prev.players ||
      game.rank !== prev.rank ||
      nextDiscount !== prevDiscount
    ) {
      this.gfxDirty = true;
    }
    this.color = color;
    this.optShowName = showName;
    this.optShowStats = showStats;
    if (nextDiscount !== prevDiscount) this.updateBadge();
  }

  setTargetR(target: number): void {
    if (Math.abs(this.sim.targetR - target) > 0.1) {
      this.sim.targetR = target;
      this.gfxDirty = true;
    }
  }

  // 엔진이 양자화된 줌 스텝에서만 호출 (LOD_ZOOM_STEP) — 핀치 중 매 프레임 재래스터 방지
  setZoom(z: number): void {
    if (Math.abs(z - this.zoom) < 0.001) return;
    this.zoom = z;
    this.gfxDirty = true;
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

    // ── LOD: 이름 / 현재 동접 수 / 순위 — **화면상 반경(sr)** 기준 판정 (semantic zoom).
    // 줌인하면 작은 버블도 임계를 넘어 이름이 나타난다 (딥 랭크 뷰의 탐색 문법)
    const sr = r * this.zoom;
    const showName = this.optShowName && sr >= LOD_NAME_MIN_R;
    const showCount = this.optShowStats && sr >= LOD_COUNT_MIN_R;
    const showRank = this.optShowStats && sr >= LOD_RANK_MIN_R;
    const layout =
      LAYOUT[(showName ? 1 : 0) + (showCount ? 1 : 0) + (showRank ? 1 : 0)];

    // 표시할 줄을 위→아래 순으로 수집 (이름 → 동접 → 순위).
    // fs는 화면 픽셀 단위 — 텍스트 객체에 1/zoom 스케일을 걸어 그대로 화면 크기가 된다
    const lines: {
      line: TextLine;
      text: string;
      fs: number;
      fill: number;
    }[] = [];
    if (showName) {
      // 이름은 항상 첫 줄 — 그 줄의 chord 폭(화면 기준)에 맞춰 자른다
      const fs = clampInt(sr * 0.2, 9, 18);
      lines.push({
        line: this.nameLine,
        text: fitText(this.game.name, fs, chordWidth(sr, layout.lineYs[0], fs)),
        fs,
        fill: 0xffffff,
      });
    }
    if (showCount) {
      lines.push({
        line: this.countLine,
        text: formatPlayers(this.game.players), // 핵심 숫자
        fs: clampInt(sr * 0.28, 10, 22),
        fill: 0xffffff,
      });
    }
    if (showRank) {
      lines.push({
        line: this.rankLine,
        text: `#${this.game.rank}`,
        fs: clampInt(sr * 0.18, 8, 15),
        fill: RANK_FILL,
      });
    }
    // 아트 배치
    if (this.art) {
      const artD = lines.length === 0 ? Math.max((r - 1.5) * 2, 4) : r * layout.artD;
      this.art.width = artD;
      this.art.height = artD;
      this.art.position.set(0, r * layout.artY);
    }

    // 텍스트 줄 배치 (없는 줄은 숨김)
    const allLines = [this.nameLine, this.countLine, this.rankLine];
    for (const tl of allLines) if (tl.obj) tl.obj.visible = false;
    const invZoom = 1 / this.zoom;
    lines.forEach((spec, i) => {
      const tl = spec.line;
      if (!tl.obj) tl.obj = this.makeText(spec.fill);
      if (tl.shown !== spec.text) {
        tl.obj.text = spec.text;
        tl.shown = spec.text;
      }
      if (tl.fs !== spec.fs) {
        tl.obj.style.fontSize = spec.fs;
        tl.fs = spec.fs;
      }
      // 카운터 스케일 — 월드 줌을 상쇄해 fs가 곧 화면 픽셀 크기 (줌인해도 선명)
      tl.obj.scale.set(invZoom);
      tl.obj.position.set(0, r * layout.lineYs[i]);
      tl.obj.visible = true;
    });

    if (this.badge) {
      // 뱃지도 화면 크기 고정 — 버블 가장자리 위 화면상 12px 지점
      this.badge.root.scale.set(invZoom);
      this.badge.root.position.set(0, -(r + 12 * invZoom));
    }
  }

  private makeText(fill: number): Text {
    const t = new Text({
      text: "",
      style: {
        fontFamily: FONT_STACK,
        fontSize: 10,
        fontWeight: "600",
        fill,
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
