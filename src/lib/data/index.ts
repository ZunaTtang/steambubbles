import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n/locales";
import type {
  BubbleSnapshot,
  Currency,
  GenreOption,
  Period,
  TrendPoint,
} from "@/lib/types";
import {
  mockGetBubbleSnapshot,
  mockGetGenreOptions,
  mockGetTrend,
} from "./mock";

// 데이터 프로바이더 스위치 — 서버 전용 (클라이언트에서 import 금지).
// DATABASE_URL이 없거나 USE_MOCK_DATA=1이면 목업, 아니면 DB(Drizzle/Neon).

export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === "1" || !process.env.DATABASE_URL;
}

export interface GetSnapshotOptions {
  period: Period;
  currency: Currency;
  locale: Locale;
}

// 페이지는 통화 쿠키 때문에 force-dynamic이지만, 데이터 조립까지 매 요청 실행하면
// Neon이 트래픽마다 깨어난다 (CLAUDE.md 4-3 ISR·비용 원칙 위반). DB 경로만 데이터 레이어
// 캐시로 감싸 (period,currency,locale)별 5분 캐시 — 홈·상세 페이지가 같은 엔트리를 공유한다.
const REVALIDATE_S = 300;

export async function getBubbleSnapshot(
  opts: GetSnapshotOptions,
): Promise<BubbleSnapshot> {
  if (isMockMode()) return mockGetBubbleSnapshot(opts);
  const { period, currency, locale } = opts;
  return unstable_cache(
    async () => {
      const { dbGetBubbleSnapshot } = await import("./db");
      return dbGetBubbleSnapshot(opts);
    },
    ["bubble-snapshot", period, currency, locale],
    { revalidate: REVALIDATE_S, tags: ["bubbles"] },
  )();
}

export async function getGenreOptions(locale: Locale): Promise<GenreOption[]> {
  if (isMockMode()) return mockGetGenreOptions(locale);
  return unstable_cache(
    async () => {
      const { dbGetGenreOptions } = await import("./db");
      return dbGetGenreOptions(locale);
    },
    ["genre-options", locale],
    { revalidate: REVALIDATE_S, tags: ["genres"] },
  )();
}

export async function getTrend(
  appid: number,
  days: number,
): Promise<TrendPoint[]> {
  if (isMockMode()) return mockGetTrend(appid, days);
  return unstable_cache(
    async () => {
      const { dbGetTrend } = await import("./db");
      return dbGetTrend(appid, days);
    },
    ["trend", String(appid), String(days)],
    { revalidate: REVALIDATE_S, tags: ["trend"] },
  )();
}
