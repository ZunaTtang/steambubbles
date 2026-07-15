import { fetchJsonWithRetry } from "./fetch-util";

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

// ─── 3-1. 동접자 Top 100 ───

export interface MostPlayedGame {
  rank: number;
  appid: number;
  players: number;
  peak: number;
}

interface GetMostPlayedGamesResponse {
  response?: {
    ranks?: {
      rank: number;
      appid: number;
      concurrent_in_game: number;
      peak_in_game: number;
    }[];
  };
}

export async function getMostPlayedGames(): Promise<MostPlayedGame[]> {
  const url = `${API_BASE}/ISteamChartsService/GetMostPlayedGames/v1/${apiKeyParam("?")}`;
  const json = await fetchJsonWithRetry<GetMostPlayedGamesResponse>(url, {
    domain: "api",
  });
  return (json.response?.ranks ?? []).map((r) => ({
    rank: r.rank,
    appid: r.appid,
    players: r.concurrent_in_game,
    peak: r.peak_in_game,
  }));
}

// ─── 3-2. 앱별 개별 폴링 (Tier 2 폴백) ───

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
}

interface RawAppDetailsEntry {
  success?: boolean;
  data?: {
    name?: string;
    header_image?: string;
    is_free?: boolean;
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
  const url = `${STORE_BASE}/api/appdetails?appids=${appid}&cc=${cc}&l=${l}&filters=price_overview,basic,genres`;
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
