// 공용 타입 계약 — 데이터 레이어(목업/DB), 버블맵, UI 셸이 전부 이 파일을 기준으로 맞춘다.

export type Period = "24h" | "7d" | "30d";
export const PERIODS: readonly Period[] = ["24h", "7d", "30d"];

// 스냅샷 범위 — top: 상위 1,000(SSR 기본, 초기 페이로드 보호) / deep: 3,000(Tier 3 포함, lazy)
export type SnapshotScope = "top" | "deep";

// 구간당 ≤250노드로 세분화 — 수백 노드 단일 뷰는 라벨 가독성이 물리적으로 불가
// (CLAUDE.md 5-1 "한 화면 최대 ~300 노드" 캡. 2026-07 Tier 3 오픈으로 3,000위까지 확장)
export type RangeKey =
  | "top100"
  | "101-300"
  | "301-500"
  | "501-750"
  | "751-1000"
  | "1001-1250"
  | "1251-1500"
  | "1501-1750"
  | "1751-2000"
  | "2001-2250"
  | "2251-2500"
  | "2501-2750"
  | "2751-3000";
export const RANGES: readonly RangeKey[] = [
  "top100",
  "101-300",
  "301-500",
  "501-750",
  "751-1000",
  "1001-1250",
  "1251-1500",
  "1501-1750",
  "1751-2000",
  "2001-2250",
  "2251-2500",
  "2501-2750",
  "2751-3000",
];
// 범위 → rank 구간 [min, max]. 라벨은 i18n 템플릿(controls.rangeBand)으로 생성 — 키 증식 방지
export const RANGE_BOUNDS: Record<RangeKey, [number, number]> = {
  top100: [1, 100],
  "101-300": [101, 300],
  "301-500": [301, 500],
  "501-750": [501, 750],
  "751-1000": [751, 1000],
  "1001-1250": [1001, 1250],
  "1251-1500": [1251, 1500],
  "1501-1750": [1501, 1750],
  "1751-2000": [1751, 2000],
  "2001-2250": [2001, 2250],
  "2251-2500": [2251, 2500],
  "2501-2750": [2501, 2750],
  "2751-3000": [2751, 3000],
};
// 이 순위를 넘는 구간을 보려면 deep 스냅샷이 필요하다
export const TOP_SCOPE_MAX_RANK = 1000;

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
  // 추적 중인 전체 동접자 합 대비 이 게임의 점유율(%) — 버블 표시용 핵심 지표
  sharePct: number;
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

// 상세 페이지 확장 데이터 — 버블 스냅샷(GameBubbleData)에는 없는 무거운/부가 필드.
// 버블맵 페이로드를 가볍게 유지하려고 상세 페이지에서만 별도 조회한다.
export interface GameDetailExtra {
  description: string | null; // Steam short_description (로케일 반영)
  releaseDate: string | null; // 출시일 (영어 표기 정본)
  totalPositive: number;
  totalNegative: number;
}

// ─── 버블맵 컴포넌트 계약 (src/components/bubble-map) ───

export type SizeBy = "players" | "peak24h";
export type ColorBy = "change" | "review";

// 버블맵 캡처 핸들 — 공유 카드가 현재 뷰포트를 PNG(data URL)로 뜰 때 사용
export interface BubbleMapHandle {
  // 현재 팬/줌 상태의 뷰포트를 PNG data URL로. 실패 시 null
  capture(resolution?: number): Promise<string | null>;
}

export interface BubbleMapProps {
  // 이미 범위/장르/검색/즐겨찾기 필터가 적용된 목록 (최대 ~300 노드)
  games: GameBubbleData[];
  sizeBy: SizeBy;
  colorBy: ColorBy;
  showName: boolean;
  showChange: boolean;
  onSelect: (game: GameBubbleData) => void;
  // 엔진 준비 시 캡처 핸들 전달(언마운트 시 null) — 공유 기능용
  onReady?: (handle: BubbleMapHandle | null) => void;
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
