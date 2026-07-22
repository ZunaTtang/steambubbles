import { fetchJsonWithRetry, sleep } from "./fetch-util";

// Steam 공식/공개 API 클라이언트 (CLAUDE.md 3).
// api.steampowered.com(일 10만 콜)과 store.steampowered.com(~200콜/5분/IP)은
// 한도 체계가 다르므로 fetch-util의 도메인별 서킷브레이커로 분리 관리한다.

const API_BASE = "https://api.steampowered.com";
const STORE_BASE = "https://store.steampowered.com";

// 일 10만 콜 예산의 전제 조건 — 키가 있으면 api 도메인 호출에 항상 첨부
function apiKeyParam(prefix: "?" | "&"): string {
  const key = process.env.STEAM_API_KEY;
  return key ? `${prefix}key=${key}` : "";
}

// ─── 3-1. 동접자 Top 100 랭킹 ───
// 실테스트(2026-07): GetGamesByConcurrentPlayers는 { rank, appid, concurrent_in_game,
// peak_in_game }를 현재 동접 기준 랭킹으로 반환(정확히 100개). 호출 1번으로 top 100의
// 현재 동접+피크를 얻으므로 Tier 1은 이 엔드포인트 1콜로 처리한다 (GetMostPlayedGames +
// 앱별 100콜 조합을 대체). 100개 초과는 반환하지 않아 Tier 2는 앱별 폴링이 유일 경로.

export interface ConcurrentGame {
  rank: number;
  appid: number;
  players: number; // 현재 동접 (concurrent_in_game)
  peak: number; // 피크 (peak_in_game)
}

interface GetGamesByConcurrentPlayersResponse {
  response?: {
    ranks?: {
      rank: number;
      appid: number;
      concurrent_in_game?: number;
      peak_in_game?: number;
    }[];
  };
}

export async function getGamesByConcurrentPlayers(): Promise<ConcurrentGame[]> {
  const url = `${API_BASE}/ISteamChartsService/GetGamesByConcurrentPlayers/v1/${apiKeyParam("?")}`;
  const json =
    await fetchJsonWithRetry<GetGamesByConcurrentPlayersResponse>(url, {
      domain: "api",
    });
  return (json.response?.ranks ?? [])
    .filter((r) => typeof r.concurrent_in_game === "number")
    .map((r) => ({
      rank: r.rank,
      appid: r.appid,
      players: r.concurrent_in_game as number,
      peak: r.peak_in_game ?? 0,
    }));
}

// ─── 3-2. 앱별 현재 동접 (Tier 1 현재치 + Tier 2 폴링) ───

interface GetNumberOfCurrentPlayersResponse {
  response?: { player_count?: number; result?: number };
}

export async function getNumberOfCurrentPlayers(
  appid: number,
): Promise<number | null> {
  const url = `${API_BASE}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}${apiKeyParam("&")}`;
  const json = await fetchJsonWithRetry<GetNumberOfCurrentPlayersResponse>(url, {
    domain: "api",
  });
  const r = json.response;
  if (!r || r.result !== 1 || typeof r.player_count !== "number") return null;
  return r.player_count;
}

// 여러 appid의 현재 동접을 제한된 동시성으로 조회 (api 도메인, 100k/일 예산 내).
// 실패한 앱은 결과 맵에서 제외 — 호출 측이 null 스냅샷을 만들지 않도록.
export async function getCurrentPlayersBulk(
  appids: number[],
  concurrency = 12,
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < appids.length) {
      const appid = appids[cursor++];
      try {
        const n = await getNumberOfCurrentPlayers(appid);
        if (n !== null) result.set(appid, n);
      } catch {
        // 개별 실패는 스킵 (서킷 오픈 등은 fetch-util이 처리)
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, appids.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return result;
}

// ─── 3-2. 폴링 유니버스 시드: SteamSpy top 페이지 (rank 101+ 후보 발굴) ───
// SteamSpy는 서드파티(1req/sec 제한) — 공식 API 서킷과 분리해 자체 처리하고, 실패 시 []로
// 우아하게 강등한다(유니버스 잡은 저빈도·비핵심). ccu(현재 동접)로 tier 2/3 시드에 사용.

export interface SteamSpyEntry {
  appid: number;
  name: string;
  ccu: number;
}

export async function getSteamSpyAllPage(page: number): Promise<SteamSpyEntry[]> {
  const url = `https://steamspy.com/api.php?request=all&page=${page}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2000);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "steambubbles/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<
        string,
        { appid?: number; name?: string; ccu?: number } | undefined
      >;
      return Object.values(json)
        .filter((v): v is { appid: number; name: string; ccu: number } =>
          Boolean(v && typeof v.appid === "number"),
        )
        .map((v) => ({ appid: v.appid, name: v.name ?? "", ccu: v.ccu ?? 0 }));
    } catch {
      // 재시도 or 최종 실패 시 아래에서 []
    }
  }
  return [];
}

// ─── 3-3. 가격 + 메타데이터 + 로컬라이즈 (cc 호출 1번이 통화+언어 동시 해결) ───

export type StoreCC = "kr" | "us";

export interface AppPriceOverview {
  currency: string;
  // Steam price_overview 규약: 최소 화폐 단위 ×100
  initial: number;
  final: number;
  discountPercent: number;
}

export interface AppDetails {
  name: string;
  headerImage: string | null;
  isFree: boolean;
  // null = 무료 게임 or price_overview 없음
  priceOverview: AppPriceOverview | null;
  genreIds: number[];
  // 상세 페이지 소개용 (로케일별) — 같은 호출에서 함께 확보, null 가능
  description: string | null;
  releaseDate: string | null;
}

interface RawAppDetailsEntry {
  success?: boolean;
  data?: {
    name?: string;
    header_image?: string;
    is_free?: boolean;
    short_description?: string;
    release_date?: { coming_soon?: boolean; date?: string };
    price_overview?: {
      currency?: string;
      initial?: number;
      final?: number;
      discount_percent?: number;
    };
    // Steam은 genre id를 문자열로 반환
    genres?: { id?: string | number; description?: string }[];
  };
}

export async function getAppDetails(
  appid: number,
  cc: StoreCC,
): Promise<AppDetails | null> {
  const l = cc === "kr" ? "korean" : "english";
  const url = `${STORE_BASE}/api/appdetails?appids=${appid}&cc=${cc}&l=${l}&filters=price_overview,basic,genres,short_description,release_date`;
  const json = await fetchJsonWithRetry<
    Record<string, RawAppDetailsEntry | undefined>
  >(url, { domain: "store" });

  // 일부 앱은 success:false / data 누락 → null 반환, 호출부에서 스킵 (CLAUDE.md 3-3)
  const entry = json[String(appid)];
  if (!entry?.success || !entry.data) return null;
  const d = entry.data;
  if (typeof d.name !== "string") return null;

  const po = d.price_overview;
  const priceOverview =
    po && typeof po.final === "number" && typeof po.currency === "string"
      ? {
          currency: po.currency,
          initial: po.initial ?? po.final,
          final: po.final,
          discountPercent: po.discount_percent ?? 0,
        }
      : null;

  const genreIds = (d.genres ?? [])
    .map((g) => Number(g.id))
    .filter((id) => Number.isFinite(id));

  return {
    name: d.name,
    headerImage: d.header_image ?? null,
    isFree: d.is_free ?? false,
    priceOverview,
    genreIds,
    description:
      typeof d.short_description === "string" && d.short_description.trim()
        ? d.short_description
        : null,
    releaseDate: d.release_date?.date?.trim() || null,
  };
}

// ─── 3-4. 평점 (query_summary만 수신) ───

export interface ReviewSummary {
  // review_score 숫자(1~9)만 사용 — review_score_desc 문자열은 저장 금지 (CLAUDE.md 3-4)
  reviewScore: number;
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
}

interface RawAppReviewsResponse {
  success?: number;
  query_summary?: {
    review_score?: number;
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
}

export async function getAppReviewSummary(
  appid: number,
): Promise<ReviewSummary | null> {
  const url = `${STORE_BASE}/appreviews/${appid}?json=1&num_per_page=0&language=all&purchase_type=all`;
  const json = await fetchJsonWithRetry<RawAppReviewsResponse>(url, {
    domain: "store",
  });
  if (json.success !== 1 || !json.query_summary) return null;
  const q = json.query_summary;
  return {
    reviewScore: q.review_score ?? 0,
    totalPositive: q.total_positive ?? 0,
    totalNegative: q.total_negative ?? 0,
    totalReviews: q.total_reviews ?? 0,
  };
}
