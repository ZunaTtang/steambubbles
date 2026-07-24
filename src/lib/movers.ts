import type { GameBubbleData } from "./types";

// "오늘의 무버스" + "왜 떴는지" 규칙 태그 (CLAUDE.md 5-1 확장 콘텐츠).
// 전부 순수 함수 — 기존 스냅샷 데이터만 사용, AI/외부 호출 없음.

const SURGE_THRESHOLD = 30; // 급등 태그 기준 변화율(%)
const NEW_WINDOW_MS = 7 * 86_400_000; // 신규 진입 기준(7일)
export const MOVERS_MIN_PLAYERS = 500; // 소규모 게임의 극단 % 노이즈 차단 게이트

export type MoverDir = "up" | "down";

// 이동 전 추정 동접(base = players / (1 + 변화율/100))과 증감 인원(Δ = 현재 − base).
// %가 아니라 실제 증감 "인원"을 지표로 쓰기 위해 변화율에서 정확히 유도한다.
export function moverBase(g: GameBubbleData): number {
  if (g.changePct === null) return g.players;
  return g.players / (1 + g.changePct / 100);
}
export function moverDelta(g: GameBubbleData): number {
  return g.players - moverBase(g);
}

// 급상승/급락 상위 — **증감 인원(Δ) 기준** 정렬(퍼센트 아님). 대형 게임의 실제 유입이 위로
// 오고, "하루 전 7명 → 812명(+11500%)" 같은 극소규모 %폭발은 Δ가 작아 자연히 밀린다.
// 콜드스타트 폴백(changeSource!=="history")은 제외(폴백 %는 항상 ≤0라 급락 오염).
// 게이트: 이동 전·후 중 큰 쪽이 substantial(≥500) — 소규모 게임 노이즈 차단.
// 범위 필터와 독립적인 전역 컷.
export function topMovers(
  games: GameBubbleData[],
  dir: MoverDir,
  limit = 8,
  minSize = MOVERS_MIN_PLAYERS,
): GameBubbleData[] {
  const pool = games.filter((g) => {
    if (g.changePct === null || g.changeSource !== "history") return false;
    if (dir === "up" ? g.changePct <= 0 : g.changePct >= 0) return false;
    const denom = 1 + g.changePct / 100;
    if (denom <= 0.02) return false; // 변화율 ~-100%(극단) 방어
    const base = g.players / denom;
    return Math.max(g.players, base) >= minSize;
  });
  // up: 증가 인원 큰 순 / down: 감소 인원(음수) 큰 순
  pool.sort((a, b) =>
    dir === "up" ? moverDelta(b) - moverDelta(a) : moverDelta(a) - moverDelta(b),
  );
  return pool.slice(0, limit);
}

export type ReasonKey = "sale" | "new" | "surge";
export interface ReasonTag {
  key: ReasonKey;
  discount?: number; // sale일 때 할인율
}

// "왜 떴는지" 한 줄 태그 — 규칙 기반(AI 아님). 설명력 순: 세일 > 신규 > 급등.
// nowMs=0(마운트 전)이면 시간 의존 태그(new)는 생략해 SSR/CSR 하이드레이션 불일치 방지.
export function reasonTag(game: GameBubbleData, nowMs: number): ReasonTag | null {
  if (game.price && game.price.discountPct > 0) {
    return { key: "sale", discount: game.price.discountPct };
  }
  if (nowMs > 0 && nowMs - new Date(game.firstSeenAt).getTime() < NEW_WINDOW_MS) {
    return { key: "new" };
  }
  if (
    game.changeSource === "history" &&
    game.changePct !== null &&
    game.changePct >= SURGE_THRESHOLD
  ) {
    return { key: "surge" };
  }
  return null;
}
