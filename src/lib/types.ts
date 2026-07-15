// 공용 타입 계약 — 데이터 레이어(목업/DB), 버블맵, UI 셸이 전부 이 파일을 기준으로 맞춘다.

export type Period = "24h" | "7d" | "30d";
export const PERIODS: readonly Period[] = ["24h", "7d", "30d"];

export type RangeKey = "top100" | "101-300" | "301-1000";
export const RANGES: readonly RangeKey[] = ["top100", "101-300", "301-1000"];
// 범위 → rank 구간 [min, max]
export const RANGE_BOUNDS: Record<RangeKey, [number, number]> = {
  top100: [1, 100],
  "101-300": [101, 300],
  "301-1000": [301, 1000],
};

export type CountryCode = "kr" | "us";
export type Currency = "KRW" | "USD";
export const CC_BY_CURRENCY: Record<Currency, CountryCode> = {
  KRW: "kr",
  USD: "us",
};

export interface PriceInfo {
  currency: Currency;
  // Steam price_overview 규약: 최소 화폐 단위 ×100 (KRW ₩16,500 → 1650000)
  initial: number;
  final: number;
  discountPct: number;
}

export interface GameBubbleData {
  appid: number;
  rank: number;
  name: string; // 로케일 반영 표시명
  nameEn: string;
  players: number;
  peak24h: number;
  // 선택 기간 동접 변화율(%). null = 산출 불가
  changePct: number | null;
  // history = 실변화율, peak-fallback = 콜드스타트 폴백(players/peak24h 기반)
  changeSource: "history" | "peak-fallback";
  headerImage: string | null;
  isFree: boolean;
  // null = 무료 게임 or 가격 데이터 없음/스테일 (우아한 강등)
  price: PriceInfo | null;
  reviewScore: number; // 0~9 (0 = 평가 없음) — 라벨은 i18n 사전 매핑
  totalReviews: number;
  genreIds: number[];
}

export interface BubbleSnapshot {
  updatedAt: string; // ISO
  period: Period;
  // rank 1~1,000 전체. 범위/장르/검색/즐겨찾기 필터는 클라이언트에서 수행
  games: GameBubbleData[];
  // true면 가격 관련 UI 전체 숨김 (CLAUDE.md 3-3 우아한 강등)
  priceDataStale: boolean;
  mock: boolean;
}

export interface GenreOption {
  id: number;
  label: string;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  peak: number;
  avg: number;
}

// ─── 버블맵 컴포넌트 계약 (src/components/bubble-map) ───

export type SizeBy = "players" | "peak24h";
export type ColorBy = "change" | "review";

export interface BubbleMapProps {
  // 이미 범위/장르/검색/즐겨찾기 필터가 적용된 목록 (최대 ~300 노드)
  games: GameBubbleData[];
  sizeBy: SizeBy;
  colorBy: ColorBy;
  showName: boolean;
  showChange: boolean;
  onSelect: (game: GameBubbleData) => void;
  className?: string;
}

// ─── 클라이언트 설정 (localStorage 저장 허용 — 클라이언트 전용 상태) ───

export interface BubbleSettings {
  sizeBy: SizeBy;
  colorBy: ColorBy;
  showName: boolean;
  showChange: boolean;
}

export const DEFAULT_BUBBLE_SETTINGS: BubbleSettings = {
  sizeBy: "players",
  colorBy: "change",
  showName: true,
  showChange: true,
};
