import type { Locale } from "@/i18n/locales";
import type { PriceInfo } from "./types";

// 동접자 축약 표기: 1,423,000 → "1.42M" / 84,300 → "84.3K"
export function formatPlayers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(n);
}

export function formatPlayersFull(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(n);
}

// Steam price_overview 규약(최소 화폐 단위 ×100) → 통화별 표시 문자열
export function formatPrice(price: PriceInfo, locale: Locale): string {
  const amount = price.final / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: price.currency === "KRW" ? 0 : 2,
  }).format(price.currency === "KRW" ? Math.round(amount) : amount);
}

export function formatChangePct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// 점유율 — 큰 값은 1자리, 작은 값(하위 랭킹)은 3자리로 의미 있는 정밀도 유지 (예: 12.8% / 0.013%)
export function formatSharePct(pct: number): string {
  return `${pct >= 1 ? pct.toFixed(1) : pct.toFixed(3)}%`;
}
