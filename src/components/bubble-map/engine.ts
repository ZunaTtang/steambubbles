import { forceCollide, forceSimulation, forceX, forceY } from "d3-force";
import type { Force, ForceX, ForceY, Simulation } from "d3-force";
import { Application, Container } from "pixi.js";
import type { ColorBy, GameBubbleData, SizeBy } from "@/lib/types";
import { colorForGame } from "./colors";
import {
  ALPHA_COOL,
  ALPHA_IDLE,
  ALPHA_REHEAT,
  CENTER_STRENGTH,
  COLLIDE_PADDING,
  JITTER_STRENGTH,
  MAX_RADIUS_DIVISOR,
  MIN_RADIUS,
  PAN_THRESHOLD,
  VELOCITY_DECAY,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./constants";
import { BubbleNode, type BubbleSimNode } from "./node";
import { loadBubbleTexture } from "./textures";

export interface EngineUpdate {
  games: GameBubbleData[];
  sizeBy: SizeBy;
  colorBy: ColorBy;
  showName: boolean;
  showChange: boolean; // 동접 수·순위 표시 토글
  onSelect: (game: GameBubbleData) => void;
  onHover?: (game: GameBubbleData | null) => void; // hover 툴팁용 (null = 벗어남)
}

function metricOf(game: GameBubbleData, sizeBy: SizeBy): number {
  return Math.max(0, sizeBy === "peak24h" ? game.peak24h : game.players);
}

// 상시 유동감 — 매 tick 미세 랜덤 속도 주입 (cryptobubbles 문법)
function jitterForce(strength: number): Force<BubbleSimNode, undefined> {
  let nodes: BubbleSimNode[] = [];
  const force: Force<BubbleSimNode, undefined> = () => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * strength;
      n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * strength;
    }
  };
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

// 비동기 초기화 팩토리 — 호출 측(React effect)은 cancelled 가드로 StrictMode 이중 마운트 처리
export async function createBubbleEngine(host: HTMLElement): Promise<BubbleEngine> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
  });
  return new BubbleEngine(app, host);
}

export class BubbleEngine {
  private readonly app: Application;
  private readonly world: Container;
  private readonly sim: Simulation<BubbleSimNode, undefined>;
  private readonly fx: ForceX<BubbleSimNode>;
  private readonly fy: ForceY<BubbleSimNode>;
  private readonly ro: ResizeObserver;
  private readonly nodes = new Map<number, BubbleNode>();
  private nodeList: BubbleNode[] = [];
  private opts: EngineUpdate | null = null;
  private width: number;
  private height: number;
  private simAlpha = ALPHA_REHEAT;
  private destroyed = false;

  // ── 팬/핀치/버블드래그 제스처 상태 (네이티브 포인터 이벤트) ──
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private didPan = false;
  private panAccum = 0;
  private pinchDist = 0;
  private pinchMidX = 0;
  private pinchMidY = 0;
  // 버블 위에서 시작한 드래그 = 해당 버블 이동(맵 팬 아님)
  private draggingNode: BubbleNode | null = null;
  private dragPointerId: number | null = null;

  constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.width = Math.max(1, host.clientWidth);
    this.height = Math.max(1, host.clientHeight);

    const canvas = app.canvas;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.touchAction = "none"; // 핀치/팬을 브라우저 제스처보다 우선
    host.appendChild(canvas);

    // 팬/줌 대상 월드 컨테이너 — 시뮬레이션 좌표계는 뷰포트 논리 크기 고정
    this.world = new Container();
    this.world.sortableChildren = true; // 호버 zIndex 앞당김용
    app.stage.addChild(this.world);

    this.fx = forceX<BubbleSimNode>(this.width / 2).strength(CENTER_STRENGTH);
    this.fy = forceY<BubbleSimNode>(this.height / 2).strength(CENTER_STRENGTH);
    this.sim = forceSimulation<BubbleSimNode>([])
      .alphaDecay(0) // 냉각은 tick에서 수동 관리 (ALPHA_COOL → ALPHA_IDLE 수렴)
      .velocityDecay(VELOCITY_DECAY)
      .force("x", this.fx)
      .force("y", this.fy)
      .force(
        "collide",
        forceCollide<BubbleSimNode>()
          .radius((d) => d.targetR + COLLIDE_PADDING)
          .iterations(2),
      )
      .force("jitter", jitterForce(JITTER_STRENGTH))
      .stop(); // 내부 타이머 대신 Pixi ticker에서 수동 tick

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerEnd);
    canvas.addEventListener("pointercancel", this.onPointerEnd);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.ro = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1].contentRect;
      if (rect.width > 0 && rect.height > 0) this.resize(rect.width, rect.height);
    });
    this.ro.observe(host);

    app.ticker.maxFPS = 60; // 고주사율 모니터에서 시뮬레이션 속도 고정
    app.ticker.add(this.tick);
  }

  // games diff 반영 — 기존 노드 재사용(위치/속도 유지), 전체 씬 재구축 금지
  update(u: EngineUpdate): void {
    if (this.destroyed) return;
    this.opts = u;
    let membershipChanged = false;
    const list: BubbleNode[] = [];
    const seen = new Set<number>();

    for (const game of u.games) {
      if (seen.has(game.appid)) continue; // 중복 appid 방어
      seen.add(game.appid);
      const color = colorForGame(game, u.colorBy);
      let node = this.nodes.get(game.appid);
      if (node) {
        // header_image가 null→URL로 채워지면(details 크론) 아트를 다시 요청
        const prevHeader = node.game.headerImage;
        node.setData(game, color, u.showName, u.showChange);
        if (game.headerImage && game.headerImage !== prevHeader) {
          const target = node;
          loadBubbleTexture(game.appid, game.headerImage, game.name, true).then(
            (tex) => {
              if (!this.destroyed && !target.isDead) target.setTexture(tex);
            },
          );
        }
      } else {
        node = this.createNode(game, color, u.showName, u.showChange);
        membershipChanged = true;
      }
      list.push(node);
    }
    for (const [appid, node] of this.nodes) {
      if (!seen.has(appid)) {
        node.destroy();
        this.nodes.delete(appid);
        membershipChanged = true;
      }
    }

    this.nodeList = list;
    const radiiChanged = this.applyRadii();
    // nodes() 재설정이 forceCollide 반경 캐시를 갱신한다 — applyRadii 이후 호출 필수
    this.sim.nodes(list.map((n) => n.sim));
    if (membershipChanged || radiiChanged) this.simAlpha = ALPHA_REHEAT; // 완만한 재가열
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ro.disconnect();
    const canvas = this.app.canvas;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerEnd);
    canvas.removeEventListener("pointercancel", this.onPointerEnd);
    canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.tick);
    this.sim.stop();
    // 대기 중 텍스처 콜백 차단 — 표시 객체 파괴는 app.destroy(children)가 담당
    for (const node of this.nodes.values()) node.markDead();
    this.nodes.clear();
    this.nodeList = [];
    this.app.destroy(true, { children: true, texture: false });
  }

  private createNode(
    game: GameBubbleData,
    color: number,
    showName: boolean,
    showChange: boolean,
  ): BubbleNode {
    // 신규 버블은 중심 근처 랜덤 위치에서 등장
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.min(this.width, this.height) * 0.28;
    const node = new BubbleNode(
      game,
      this.width / 2 + Math.cos(angle) * dist,
      this.height / 2 + Math.sin(angle) * dist,
      MIN_RADIUS,
      color,
      showName,
      showChange,
      this.handleTap,
      this.handleHover,
    );
    this.world.addChild(node.container);
    this.nodes.set(game.appid, node);
    // 텍스처 지연 로드 (동시 8개 큐) — 실패 시 이니셜 폴백이 자동 적용
    loadBubbleTexture(game.appid, game.headerImage, game.name).then((tex) => {
      if (!this.destroyed && !node.isDead) node.setTexture(tex);
    });
    return node;
  }

  // sqrt 스케일 반경 재계산 (선형 금지) — 유의미한 변화가 있으면 true
  private applyRadii(): boolean {
    const opts = this.opts;
    const list = this.nodeList;
    if (!opts || list.length === 0) return false;
    let vMax = 1;
    for (const n of list) vMax = Math.max(vMax, metricOf(n.game, opts.sizeBy));
    const maxR = Math.max(
      MIN_RADIUS + 4,
      Math.min(this.width, this.height) / MAX_RADIUS_DIVISOR,
    );
    let changed = false;
    for (const n of list) {
      const target =
        MIN_RADIUS +
        (maxR - MIN_RADIUS) * Math.sqrt(metricOf(n.game, opts.sizeBy) / vMax);
      if (Math.abs(target - n.sim.targetR) > 0.5) changed = true;
      n.setTargetR(target);
    }
    return changed;
  }

  private resize(w: number, h: number): void {
    if (this.destroyed) return;
    if (Math.abs(w - this.width) < 1 && Math.abs(h - this.height) < 1) return;
    this.width = w;
    this.height = h;
    this.app.renderer.resize(w, h);
    this.fx.x(w / 2);
    this.fy.y(h / 2);
    if (this.applyRadii()) {
      this.sim.nodes(this.nodeList.map((n) => n.sim)); // collide 반경 캐시 갱신
      this.simAlpha = Math.max(this.simAlpha, ALPHA_REHEAT * 0.5);
    }
  }

  // 메인 루프 — 수동 냉각 + 시뮬레이션 1 tick + 노드 시각 동기
  private readonly tick = (): void => {
    if (this.destroyed) return;
    this.simAlpha += (ALPHA_IDLE - this.simAlpha) * ALPHA_COOL;
    this.sim.alpha(this.simAlpha);
    this.sim.tick();
    const list = this.nodeList;
    for (let i = 0; i < list.length; i++) list[i].frame();
  };

  // 탭 = 선택 (Pixi pointertap). 팬/버블드래그로 많이 움직였으면 무시
  private readonly handleTap = (game: GameBubbleData): void => {
    if (this.didPan) return;
    this.opts?.onSelect(game);
  };

  // hover 진입/이탈 → React 툴팁에 통지. 이탈은 현재 hover 대상일 때만 (over(B)→out(A) 순서 방어)
  private hoverGame: GameBubbleData | null = null;
  private readonly handleHover = (game: GameBubbleData, hovered: boolean): void => {
    if (hovered) {
      this.hoverGame = game;
      this.opts?.onHover?.(game);
    } else if (this.hoverGame === game) {
      this.hoverGame = null;
      this.opts?.onHover?.(null);
    }
  };

  // 화면 좌표 → 월드 좌표 (팬/줌 반영)
  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const s = this.world.scale.x;
    return {
      x: (clientX - rect.left - this.world.x) / s,
      y: (clientY - rect.top - this.world.y) / s,
    };
  }

  // 포인터 아래 버블 찾기 (중심 최근접). 없으면 null → 맵 팬
  private hitTestNode(clientX: number, clientY: number): BubbleNode | null {
    const { x: wx, y: wy } = this.toWorld(clientX, clientY);
    let best: BubbleNode | null = null;
    let bestD2 = Infinity;
    for (const n of this.nodeList) {
      const dx = wx - (n.sim.x ?? 0);
      const dy = wy - (n.sim.y ?? 0);
      const d2 = dx * dx + dy * dy;
      const r = n.radius;
      if (d2 <= r * r && d2 < bestD2) {
        bestD2 = d2;
        best = n;
      }
    }
    return best;
  }

  // 버블 드래그 해제 — 고정을 풀어 다시 물리 흐름에 합류시킨다 (선택은 Pixi pointertap 소관)
  private releaseDrag(): void {
    const node = this.draggingNode;
    this.draggingNode = null;
    this.dragPointerId = null;
    if (!node) return;
    node.sim.fx = null;
    node.sim.fy = null;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    try {
      this.app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 포인터가 이미 소멸한 경우 — 무시
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.didPan = false;
      this.panAccum = 0;
      // 버블 위에서 시작 → 그 버블 드래그, 배경에서 시작 → 맵 팬
      const node = this.hitTestNode(e.clientX, e.clientY);
      if (node) {
        this.draggingNode = node;
        this.dragPointerId = e.pointerId;
        node.sim.fx = node.sim.x;
        node.sim.fy = node.sim.y;
        this.simAlpha = Math.max(this.simAlpha, ALPHA_REHEAT);
      }
    } else if (this.pointers.size === 2) {
      // 핀치 시작 — 진행 중이던 버블 드래그는 해제
      this.releaseDrag();
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMidX = (a.x + b.x) / 2;
      this.pinchMidY = (a.y + b.y) / 2;
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size === 1) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.panAccum += Math.abs(dx) + Math.abs(dy);
      if (this.panAccum > PAN_THRESHOLD) this.didPan = true;
      if (this.draggingNode) {
        // 버블 드래그 — 노드를 포인터 월드 좌표에 고정 (collide가 이웃을 밀어냄)
        const w = this.toWorld(e.clientX, e.clientY);
        this.draggingNode.sim.fx = w.x;
        this.draggingNode.sim.fy = w.y;
        this.simAlpha = Math.max(this.simAlpha, 0.3);
      } else if (this.didPan) {
        // 배경 드래그 = 맵 팬
        this.world.x += dx;
        this.world.y += dy;
      }
    } else if (this.pointers.size === 2) {
      // 두 손가락 = 핀치 줌 + 미드포인트 팬
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (this.pinchDist > 0) {
        const rect = this.app.canvas.getBoundingClientRect();
        this.zoomAt(
          midX - rect.left,
          midY - rect.top,
          this.world.scale.x * (dist / this.pinchDist),
        );
        this.world.x += midX - this.pinchMidX;
        this.world.y += midY - this.pinchMidY;
      }
      this.pinchDist = dist;
      this.pinchMidX = midX;
      this.pinchMidY = midY;
      this.didPan = true;
    }
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    // 드래그 중이던 포인터가 떼어지면 고정 해제 (탭이면 Pixi pointertap이 선택 처리)
    if (this.draggingNode && e.pointerId === this.dragPointerId) {
      this.releaseDrag();
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0012);
    this.zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      this.world.scale.x * factor,
    );
  };

  // 커서(로컬 좌표) 기준 줌 — 커서 아래 월드 지점을 고정
  private zoomAt(localX: number, localY: number, nextScale: number): void {
    const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
    const cur = this.world.scale.x;
    if (s === cur) return;
    const wx = (localX - this.world.x) / cur;
    const wy = (localY - this.world.y) / cur;
    this.world.scale.set(s);
    this.world.position.set(localX - wx * s, localY - wy * s);
  }
}
