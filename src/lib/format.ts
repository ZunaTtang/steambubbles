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

// 동접 증감 인원 — 부호 + 로케일 자릿수 구분 (예: +45,200 / -1,300)
export function formatPlayerDelta(n: number, locale: Locale): string {
  const r = Math.round(n);
  const sign = r > 0 ? "+" : r < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat(locale).format(Math.abs(r))}`;
}

// 점유율 — 큰 값은 1자리, 작은 값(하위 랭킹)은 3자리로 의미 있는 정밀도 유지 (예: 12.8% / 0.013%)
export function formatSharePct(pct: number): string {
  return `${pct >= 1 ? pct.toFixed(1) : pct.toFixed(3)}%`;
}

function fromCodePointSafe(cp: number): string {
  try {
    return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : "";
  } catch {
    return "";
  }
}

// Steam short_description 등은 HTML을 포함할 수 있다(태그 + &quot;·&#39; 같은 엔티티).
// 평문 <p>{text}</p>로 렌더하면 엔티티가 그대로 노출되므로(예: &quot;팰&quot;) 태그를
// 제거하고 엔티티를 디코드해 정리한다. 태그 제거를 먼저 하고(리터럴 <...>), 그 다음
// 엔티티를 디코드해(&lt;→<) 디코드 결과가 다시 태그로 잘리지 않게 한다. &amp;는 이중
// 디코드를 막으려고 가장 마지막에.
export function cleanSteamText(input: string): string {
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<\/(?:p|div|li|ul|ol|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePointSafe(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePointSafe(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
