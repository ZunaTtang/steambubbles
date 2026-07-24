import type { GameBubbleData } from "./types";

// "오늘의 무버스" + "왜 떴는지" 규칙 태그 (CLAUDE.md 5-1 확장 콘텐츠).
// 전부 순수 함수 — 기존 스냅샷 데이터만 사용, AI/외부 호출 없음.

const SURGE_THRESHOLD = 30; // 급등 태그 기준 변화율(%)
const NEW_WINDOW_MS = 7 * 86_400_000; // 신규 진입 기준(7일)
export const MOVERS_MIN_PLAYERS = 500; // 소규모 게임의 극단 % 노이즈 차단 게이트

export type MoverDir = "up" | "down";

// 급상승/급락 상위. 콜드스타트 폴백(changeSource!=="history")은 제외 —
// 폴백 변화율은 players/peak24h라 항상 ≤0이라 급락 목록을 오염시킨다.
// 노이즈 차단: "이동 전 기준치(base)"가 substantial한 게임만 — base는 변화율에서 유도
// (base = players / (1 + 변화율/100)). 이렇게 하면 "하루 전 7명 → 지금 812명(+11500%)"
// 같은 극소규모 폭발이 대형 게임의 의미 있는 급상승/급락을 밀어내지 못한다.
// 범위 필터와 독립적인 전역 컷("오늘 가장 급상승").
export function topMovers(
  games: GameBubbleData[],
  dir: MoverDir,
  limit = 8,
  minBase = MOVERS_MIN_PLAYERS,
): GameBubbleData[] {
  const pool = games.filter((g) => {
    if (g.changePct === null || g.changeSource !== "history") return false;
    if (dir === "up" ? g.changePct <= 0 : g.changePct >= 0) return false;
    if (g.players < 50) return false; // 사실상 소멸한 게임 제외
    const denom = 1 + g.changePct / 100;
    if (denom <= 0.02) return false; // 변화율 ~-100%(극단) 방어
    const impliedBase = g.players / denom; // 이동 전 추정 동접
    return impliedBase >= minBase;
  });
  pool.sort((a, b) =>
    dir === "up"
      ? (b.changePct ?? 0) - (a.changePct ?? 0)
      : (a.changePct ?? 0) - (b.changePct ?? 0),
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
