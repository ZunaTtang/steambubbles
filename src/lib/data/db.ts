import { and, asc, count, desc, eq, gte, inArray, lte, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appGenres,
  apps,
  genreI18n,
  genres,
  playerDaily,
  playerSnapshots,
  prices,
  reviews,
} from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import staticGenres from "@/mocks/genres.json";
import {
  CC_BY_CURRENCY,
  type BubbleSnapshot,
  type Currency,
  type GameBubbleData,
  type GenreOption,
  type Period,
  type PriceInfo,
  type TrendPoint,
} from "@/lib/types";

// DB 데이터 프로바이더 — src/lib/data/index.ts의 스위치가 동적 import한다.
// 앱별 루프 쿼리 금지: 스냅샷 규모(~1,000행)에서 셋 기반 쿼리 몇 개로 조립한다.

const DAY_MS = 86_400_000;
const PRICE_STALE_MS = 3 * DAY_MS; // 우아한 강등 기준 (CLAUDE.md 3-3)
// 24h 기준점 스냅샷 탐색 허용 오차 — 이 창에 스냅샷이 없으면 히스토리 부재로 간주
const BASELINE_WINDOW_MS = 6 * 3_600_000;

function emptySnapshot(period: Period): BubbleSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    period,
    games: [],
    priceDataStale: false,
    mock: false,
  };
}

export async function dbGetBubbleSnapshot(opts: {
  period: Period;
  currency: Currency;
  locale: Locale;
}): Promise<BubbleSnapshot> {
  const { period, currency, locale } = opts;
  const db = getDb();

  // 최신 스냅샷 시각
  const tsRows = await db
    .select({ ts: max(playerSnapshots.ts) })
    .from(playerSnapshots);
  const latestTs = tsRows[0]?.ts ? new Date(tsRows[0].ts) : null;
  if (!latestTs) return emptySnapshot(period);

  // 최신 스냅샷 + 앱 메타 (동접 내림차순 = rank 순)
  const current = await db
    .select({
      appid: playerSnapshots.appid,
      players: playerSnapshots.players,
      nameEn: apps.nameEn,
      nameKo: apps.nameKo,
      headerImage: apps.headerImage,
      isFree: apps.isFree,
    })
    .from(playerSnapshots)
    .innerJoin(apps, eq(apps.appid, playerSnapshots.appid))
    .where(eq(playerSnapshots.ts, latestTs))
    .orderBy(desc(playerSnapshots.players), asc(playerSnapshots.appid))
    .limit(1000);
  if (current.length === 0) return emptySnapshot(period);

  const appids = current.map((r) => r.appid);

  // 앱별 24h 피크
  const peakRows = await db
    .select({ appid: playerSnapshots.appid, peak: max(playerSnapshots.players) })
    .from(playerSnapshots)
    .where(
      and(
        inArray(playerSnapshots.appid, appids),
        gte(playerSnapshots.ts, new Date(latestTs.getTime() - DAY_MS)),
      ),
    )
    .groupBy(playerSnapshots.appid);
  const peakByApp = new Map<number, number>(
    peakRows.map((r) => [r.appid, r.peak ?? 0]),
  );

  // 변화율 기준점 — 24h: ts-24h에 가장 가까운 스냅샷 / 7d·30d: N일 전 player_daily.peak
  const baseByApp = new Map<number, number>();
  if (period === "24h") {
    const target = new Date(latestTs.getTime() - DAY_MS);
    const targetEpoch = Math.floor(target.getTime() / 1000);
    const baseRows = await db
      .selectDistinctOn([playerSnapshots.appid], {
        appid: playerSnapshots.appid,
        players: playerSnapshots.players,
      })
      .from(playerSnapshots)
      .where(
        and(
          inArray(playerSnapshots.appid, appids),
          gte(playerSnapshots.ts, new Date(target.getTime() - BASELINE_WINDOW_MS)),
          lte(playerSnapshots.ts, new Date(target.getTime() + BASELINE_WINDOW_MS)),
        ),
      )
      .orderBy(
        asc(playerSnapshots.appid),
        sql`abs(extract(epoch from ${playerSnapshots.ts}) - ${targetEpoch})`,
      );
    for (const r of baseRows) baseByApp.set(r.appid, r.players);
  } else {
    const days = period === "7d" ? 7 : 30;
    const targetDate = new Date(latestTs.getTime() - days * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const baseRows = await db
      .select({ appid: playerDaily.appid, peak: playerDaily.peak })
      .from(playerDaily)
      .where(
        and(inArray(playerDaily.appid, appids), eq(playerDaily.date, targetDate)),
      );
    for (const r of baseRows) baseByApp.set(r.appid, r.peak);
  }

  // 가격 — 테이블 비어있지 않고 최신 갱신이 3일 초과면 stale → 가격 전체 숨김 (우아한 강등)
  const priceMetaRows = await db
    .select({ cnt: count(), latest: max(prices.updatedAt) })
    .from(prices);
  const priceCount = priceMetaRows[0]?.cnt ?? 0;
  const latestPriceUpdate = priceMetaRows[0]?.latest
    ? new Date(priceMetaRows[0].latest).getTime()
    : null;
  const priceDataStale =
    priceCount > 0 &&
    (latestPriceUpdate === null ||
      Date.now() - latestPriceUpdate > PRICE_STALE_MS);

  const cc = CC_BY_CURRENCY[currency];
  const priceByApp = new Map<number, PriceInfo>();
  if (priceCount > 0 && !priceDataStale) {
    const priceRows = await db
      .select({
        appid: prices.appid,
        price: prices.price,
        priceInitial: prices.priceInitial,
        discountPercent: prices.discountPercent,
      })
      .from(prices)
      .where(and(eq(prices.cc, cc), inArray(prices.appid, appids)));
    for (const r of priceRows) {
      priceByApp.set(r.appid, {
        currency,
        initial: r.priceInitial,
        final: r.price,
        discountPct: r.discountPercent,
      });
    }
  }

  // 평점
  const reviewRows = await db
    .select({
      appid: reviews.appid,
      reviewScore: reviews.reviewScore,
      totalReviews: reviews.totalReviews,
    })
    .from(reviews)
    .where(inArray(reviews.appid, appids));
  const reviewByApp = new Map(reviewRows.map((r) => [r.appid, r]));

  // 장르
  const genreRows = await db
    .select({ appid: appGenres.appid, genreId: appGenres.genreId })
    .from(appGenres)
    .where(inArray(appGenres.appid, appids));
  const genresByApp = new Map<number, number[]>();
  for (const r of genreRows) {
    const list = genresByApp.get(r.appid);
    if (list) list.push(r.genreId);
    else genresByApp.set(r.appid, [r.genreId]);
  }

  const games: GameBubbleData[] = current.map((row, i) => {
    const players = row.players;
    const peak24h = Math.max(peakByApp.get(row.appid) ?? 0, players);

    const base = baseByApp.get(row.appid);
    let changePct: number | null;
    let changeSource: GameBubbleData["changeSource"];
    if (base !== undefined && base > 0) {
      changePct = (players / base - 1) * 100;
      changeSource = "history";
    } else {
      // 콜드스타트 폴백 (CLAUDE.md 5-1): 24h 피크 대비 현재치
      changeSource = "peak-fallback";
      changePct = peak24h > 0 ? (players / peak24h - 1) * 100 : null;
    }

    // 이름은 details 크론이 채운다 — 미수집 앱은 appid 폴백
    const fallbackName = `#${row.appid}`;
    const name =
      locale === "ko"
        ? (row.nameKo ?? row.nameEn ?? fallbackName)
        : (row.nameEn ?? row.nameKo ?? fallbackName);
    const review = reviewByApp.get(row.appid);

    return {
      appid: row.appid,
      rank: i + 1,
      name,
      nameEn: row.nameEn ?? fallbackName,
      players,
      peak24h,
      changePct,
      changeSource,
      headerImage: row.headerImage,
      isFree: row.isFree,
      price: row.isFree ? null : (priceByApp.get(row.appid) ?? null),
      reviewScore: review?.reviewScore ?? 0,
      totalReviews: review?.totalReviews ?? 0,
      genreIds: genresByApp.get(row.appid) ?? [],
    };
  });

  return {
    updatedAt: latestTs.toISOString(),
    period,
    games,
    priceDataStale,
    mock: false,
  };
}

export async function dbGetGenreOptions(locale: Locale): Promise<GenreOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: genres.id, locale: genreI18n.locale, label: genreI18n.label })
    .from(genres)
    .leftJoin(
      genreI18n,
      and(
        eq(genreI18n.genreId, genres.id),
        inArray(genreI18n.locale, locale === "en" ? ["en"] : [locale, "en"]),
      ),
    )
    .orderBy(asc(genres.id));

  // 자체 관리 사전(genre_i18n 미시딩 대비): 요청 로케일 → en → 정적 사전 순 폴백
  const staticLabels = new Map(
    (staticGenres as { id: number; labels: Record<string, string> }[]).map(
      (g) => [g.id, g.labels[locale] ?? g.labels.en],
    ),
  );
  const byId = new Map<number, GenreOption>();
  for (const r of rows) {
    const existing = byId.get(r.id);
    if (existing && r.locale !== locale) continue;
    const label = r.label ?? staticLabels.get(r.id) ?? `#${r.id}`;
    byId.set(r.id, { id: r.id, label });
  }
  return [...byId.values()];
}

export async function dbGetTrend(
  appid: number,
  days: number,
): Promise<TrendPoint[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  return db
    .select({ date: playerDaily.date, peak: playerDaily.peak, avg: playerDaily.avg })
    .from(playerDaily)
    .where(and(eq(playerDaily.appid, appid), gte(playerDaily.date, since)))
    .orderBy(asc(playerDaily.date));
}
