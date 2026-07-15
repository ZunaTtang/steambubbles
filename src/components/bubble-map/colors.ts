import type { ColorBy, GameBubbleData } from "@/lib/types";

// 버블 색상 문법 (CLAUDE.md 5-1) — 채움은 저알파, 외곽선은 원색

export const COLOR_UP = 0x16c784;
export const COLOR_DOWN = 0xea3943;
export const COLOR_NEUTRAL = 0x8b96a8;
// 할인 링/뱃지 (구매 신호 레이어)
export const COLOR_DISCOUNT = 0xfbbf24;
export const FILL_ALPHA = 0.16;

export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * k);
  const bl = Math.round(ab + ((b & 0xff) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

// 변화율 → 색. |0.5%| 미만·null은 중립 회색, |30%|에서 채도 포화
export function changeColor(changePct: number | null): number {
  if (changePct === null) return COLOR_NEUTRAL;
  const mag = Math.abs(changePct);
  if (mag < 0.5) return COLOR_NEUTRAL;
  const t = Math.min(mag, 30) / 30;
  return lerpColor(COLOR_NEUTRAL, changePct > 0 ? COLOR_UP : COLOR_DOWN, 0.3 + 0.7 * t);
}

// review_score 1~9 → 빨강→노랑→초록 매핑. 0(평가 없음)은 회색
export function reviewColor(score: number): number {
  if (score <= 0) return COLOR_NEUTRAL;
  const t = (Math.min(score, 9) - 1) / 8;
  return t < 0.5
    ? lerpColor(COLOR_DOWN, COLOR_DISCOUNT, t * 2)
    : lerpColor(COLOR_DISCOUNT, COLOR_UP, (t - 0.5) * 2);
}

export function colorForGame(game: GameBubbleData, colorBy: ColorBy): number {
  return colorBy === "review" ? reviewColor(game.reviewScore) : changeColor(game.changePct);
}
