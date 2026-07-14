// 로케일 정책 (CLAUDE.md 4-4) — 구조는 전체 로케일을 지원하되, 오픈은 신호 후.
// 로케일 오픈 절차: OPEN_LOCALES에 원소 추가 + messages/{locale}.json 사전 추가.

export const ALL_LOCALES = ["ko", "en", "ja", "zh"] as const;
export type Locale = (typeof ALL_LOCALES)[number];

// Launch는 ko만 오픈. en 사전은 폴백용으로만 유지 (노출·sitemap 제외).
export const OPEN_LOCALES = ["ko"] as const;
export const DEFAULT_LOCALE = "ko" as const;

// 로케일 기본 통화 (ko→KRW, 그 외→USD).
// JPY/EUR 등 통화 확장은 해당 로케일 오픈과 동시 진행 (동결 백로그).
export const DEFAULT_CURRENCY: Record<Locale, "KRW" | "USD"> = {
  ko: "KRW",
  en: "USD",
  ja: "USD",
  zh: "USD",
};

// 수동 통화 전환은 쿠키에 저장 — SSR이 읽어야 하므로 localStorage 금지 (CLAUDE.md 7)
export const CURRENCY_COOKIE = "currency";
