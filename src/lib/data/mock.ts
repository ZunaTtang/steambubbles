import type { Locale } from "@/i18n/locales";
import type {
  BubbleSnapshot,
  Currency,
  GenreOption,
  Period,
  TrendPoint,
} from "@/lib/types";
import rawGames from "@/mocks/games.json";
import rawGenres from "@/mocks/genres.json";

// 목업 데이터 프로바이더 — DATABASE_URL 미설정(또는 USE_MOCK_DATA=1) 시 사용.
// 실데이터 전환은 src/lib/data/index.ts의 스위치가 담당한다.

interface MockPrice {
  initial: number;
  final: number;
  discountPct: number;
}

interface MockGame {
  appid: number;
  rank: number;
  nameEn: string;
  nameKo: string;
  isFree: boolean;
  players: number;
  peak24h: number;
  change24h: number;
  change7d: number;
  change30d: number;
  hasImage: boolean;
  reviewScore: number;
  totalReviews: number;
  genreIds: number[];
  priceKrw: MockPrice | null;
  priceUsd: MockPrice | null;
}

const headerUrl = (appid: number) =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;

export async function mockGetBubbleSnapshot(opts: {
  period: Period;
  currency: Currency;
  locale: Locale;
}): Promise<BubbleSnapshot> {
  const { period, currency, locale } = opts;
  const games = (rawGames as MockGame[]).map((g) => {
    const price = currency === "KRW" ? g.priceKrw : g.priceUsd;
    const changePct =
      period === "24h" ? g.change24h : period === "7d" ? g.change7d : g.change30d;
    return {
      appid: g.appid,
      rank: g.rank,
      name: locale === "ko" ? g.nameKo : g.nameEn,
      nameEn: g.nameEn,
      players: g.players,
      peak24h: g.peak24h,
      changePct,
      changeSource: "history" as const,
      headerImage: g.hasImage ? headerUrl(g.appid) : null,
      isFree: g.isFree,
      price: price ? { currency, ...price } : null,
      reviewScore: g.reviewScore,
      totalReviews: g.totalReviews,
      genreIds: g.genreIds,
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    period,
    games,
    priceDataStale: false,
    mock: true,
  };
}

export async function mockGetGenreOptions(locale: Locale): Promise<GenreOption[]> {
  return (rawGenres as { id: number; labels: Record<string, string> }[]).map(
    (g) => ({ id: g.id, label: g.labels[locale] ?? g.labels.en }),
  );
}

// mulberry32 — appid 기반 결정론적 노이즈
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function mockGetTrend(
  appid: number,
  days: number,
): Promise<TrendPoint[]> {
  const g = (rawGames as MockGame[]).find((x) => x.appid === appid);
  const base = g?.players ?? 5000;
  const points: TrendPoint[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const t = days - i;
    const season =
      Math.sin((appid % 7) + t / 4.7) * 0.12 + Math.sin(t / 11.3) * 0.08;
    const noise = (rng(appid * 1000 + i)() - 0.5) * 0.08;
    const avg = Math.max(50, Math.round(base * (1 + season + noise)));
    points.push({
      date: new Date(now - i * 86_400_000).toISOString().slice(0, 10),
      avg,
      peak: Math.round(avg * 1.25),
    });
  }
  return points;
}
