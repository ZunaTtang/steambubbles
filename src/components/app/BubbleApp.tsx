"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CURRENCY_COOKIE } from "@/i18n/locales";
import type {
  BubbleMapHandle,
  BubbleSnapshot,
  Currency,
  GameBubbleData,
  GenreOption,
  Period,
  RangeKey,
  SnapshotScope,
} from "@/lib/types";
import { RANGES, RANGE_BOUNDS, TOP_SCOPE_MAX_RANK } from "@/lib/types";
import { useFavorites, useSettings } from "./hooks";
import TopBar from "./TopBar";
import GameModal from "./GameModal";
import RankingTable from "./RankingTable";
import BubbleDraw from "./BubbleDraw";
import ShareModal from "./ShareModal";

const PERIOD_LABEL_KEY: Record<Period, string> = {
  "24h": "period24h",
  "7d": "period7d",
  "30d": "period30d",
};

// PixiJS 렌더러는 브라우저 전용 — SSR 제외
const BubbleMap = dynamic(
  () => import("@/components/bubble-map/BubbleMap"),
  { ssr: false, loading: () => <LoadingIndicator /> },
);

function LoadingIndicator() {
  const t = useTranslations("common");
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[#16c784]" />
      <span className="text-sm">{t("loading")}</span>
    </div>
  );
}

interface BubbleAppProps {
  initialSnapshot: BubbleSnapshot;
  genres: GenreOption[];
  initialCurrency: Currency;
}

export default function BubbleApp({
  initialSnapshot,
  genres,
  initialCurrency,
}: BubbleAppProps) {
  const locale = useLocale();
  const tControls = useTranslations("controls");
  const tCommon = useTranslations("common");
  const tTable = useTranslations("table");
  const tDraw = useTranslations("draw");
  const tShare = useTranslations("share");

  const [period, setPeriod] = useState<Period>("24h");
  const [range, setRange] = useState<RangeKey>("top100");
  // 커스텀 순위 범위(직접 입력). null이면 프리셋 range 사용 — 실제 필터 경계는 아래 activeBounds
  const [customRange, setCustomRange] = useState<readonly [number, number] | null>(
    null,
  );
  // top = SSR 초기 스냅샷(상위 1,000). 딥 밴드(1,001~)나 뽑기를 쓰는 순간 deep(3,000)으로
  // 승급해 재조회 — 초기 페이로드는 가볍게, 딥 데이터는 필요할 때만 (Tier 3 오픈)
  const [scope, setScope] = useState<SnapshotScope>("top");
  // 현재 snapshot이 실제로 어떤 스코프의 데이터인지 — scope(요청값)와 달리 fetch 성공
  // 시점에만 바뀐다. 실측 최대 랭크 판정은 반드시 이 값 기준 (요청 직후 top 스냅샷으로
  // 오판해 잘못 폴백하는 레이스 방지)
  const [appliedScope, setAppliedScope] = useState<SnapshotScope>("top");
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(
    () => new Set(),
  );
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [snapshot, setSnapshot] = useState<BubbleSnapshot>(initialSnapshot);
  const [selectedGame, setSelectedGame] = useState<GameBubbleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 버블맵 엔진 캡처 핸들 — 공유 이미지 생성용 (엔진 준비 시 채워짐)
  const mapHandleRef = useRef<BubbleMapHandle | null>(null);
  // sticky 상단 바 높이 — 첫 화면 맵 영역을 (뷰포트 − 헤더)로 정확히 배분 + 랭킹 점프 보정
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);

  const { settings, update: updateSettings } = useSettings();
  const { favorites, toggle: toggleFavorite } = useFavorites();

  // 현재 snapshot이 실제로 대표하는 조합. 첫 렌더는 서버 initialSnapshot(24h·initialCurrency·top)이므로
  // 이 값과 일치하면 재조회를 건너뛴다 — StrictMode 이중 마운트/오류 후 되돌림에도 값 기반이라 안전.
  const appliedRef = useRef({ period, currency, locale, scope });
  useEffect(() => {
    if (
      appliedRef.current.period === period &&
      appliedRef.current.currency === currency &&
      appliedRef.current.locale === locale &&
      appliedRef.current.scope === scope
    ) {
      return;
    }
    const ctrl = new AbortController();
    const reqPeriod = period;
    const reqCurrency = currency;
    const reqLocale = locale;
    const reqScope = scope;
    setLoading(true);
    fetch(
      `/api/bubbles?period=${reqPeriod}&currency=${reqCurrency}&locale=${reqLocale}${
        reqScope === "deep" ? "&scope=deep" : ""
      }`,
      { signal: ctrl.signal },
    )
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: BubbleSnapshot) => {
        setSnapshot(data);
        setAppliedScope(reqScope); // snapshot과 원자적으로 — 실측 최대 랭크 판정 근거
        // 통화는 SSR이 읽어야 하므로 쿠키 저장 (localStorage 금지 — CLAUDE.md 7).
        // 성공적으로 반영된 통화만 저장해 쿠키와 표시 데이터가 어긋나지 않게 한다.
        if (reqCurrency !== appliedRef.current.currency) {
          document.cookie = `${CURRENCY_COOKIE}=${reqCurrency}; path=/; max-age=31536000; samesite=lax`;
        }
        appliedRef.current = {
          period: reqPeriod,
          currency: reqCurrency,
          locale: reqLocale,
          scope: reqScope,
        };
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return; // 재요청/언마운트 — 정상
        // 실패: 기간/통화/스코프 선택을 실제 표시 중인 데이터로 되돌려 오라벨 방지
        setLoading(false);
        setPeriod(appliedRef.current.period);
        setCurrency(appliedRef.current.currency);
        setScope(appliedRef.current.scope);
      });
    return () => ctrl.abort();
  }, [period, currency, locale, scope]);

  // 통화 변경은 낙관적 UI만 — 쿠키는 재조회 성공 시 기록한다
  const changeCurrency = useCallback((next: Currency) => {
    setCurrency(next);
  }, []);

  // 프리셋 선택 — 커스텀 해제. 딥 밴드(1,001~) 선택 시 deep 스냅샷으로 승급(유지)
  const selectPreset = useCallback((next: RangeKey) => {
    setCustomRange(null);
    setRange(next);
    if (RANGE_BOUNDS[next][1] > TOP_SCOPE_MAX_RANK) setScope("deep");
  }, []);

  // 커스텀 범위 직접 입력 — clamp/스팬 상한은 RangeControl이 적용해 넘겨준다.
  // max가 1,000 초과면 deep 스냅샷 승급
  const applyCustomRange = useCallback((min: number, max: number) => {
    setCustomRange([min, max]);
    if (max > TOP_SCOPE_MAX_RANK) setScope("deep");
  }, []);

  // 뽑기는 전체 풀에서 추첨하는 게 정직 — 열 때 deep 로드를 함께 트리거
  const openDraw = useCallback(() => {
    setDrawOpen(true);
    setScope("deep");
  }, []);

  // 버블맵 엔진 준비/해제 시 캡처 핸들 보관 (stable — 마운트 1회 effect에서 호출)
  const handleMapReady = useCallback((h: BubbleMapHandle | null) => {
    mapHandleRef.current = h;
  }, []);
  const captureMap = useCallback(
    (r?: number) => mapHandleRef.current?.capture(r) ?? Promise.resolve(null),
    [],
  );

  // updatedAt는 클라이언트 로컬 타임존으로만 렌더 — 서버(UTC)에서 포맷해 굳으면 KST 유저에게 오시각 표시
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 상단 바 실제 높이 추적 (모바일 2행/데스크톱 1행 등 가변) → 맵 높이·스크롤 보정에 사용
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 실측 최대 랭크 — deep 스냅샷이 "실제로 적용된" 뒤에만 안다 (top 스냅샷은 1,000 컷이라 미지).
  // scope(요청값)가 아니라 appliedScope 기준 — 요청 직후 top 스냅샷이 남아있는 렌더 창에서
  // 1,000을 실측치로 오판해 잘못 폴백하는 레이스 방지.
  // tier 3 후보 중 동접 API가 응답하지 않는 앱이 있어 실측 최대는 3,000보다 작다 (예: ~2,600)
  const maxAvailableRank =
    appliedScope === "deep" && snapshot.games.length > 0
      ? snapshot.games[snapshot.games.length - 1].rank
      : null;

  // 선택된 구간이 실측 데이터 밖이면(예: 2,751~3,000인데 최대 2,608위) 가장 깊은 유효
  // 구간으로 폴백 — "조건에 맞는 게임이 없습니다" 데드엔드 방지
  useEffect(() => {
    if (maxAvailableRank === null) return;
    if (customRange) {
      // 커스텀 최소가 실측 최대를 넘으면(데이터 밖) 커스텀 해제 → 프리셋 복귀로 데드엔드 방지
      if (customRange[0] > maxAvailableRank) setCustomRange(null);
      return;
    }
    if (RANGE_BOUNDS[range][0] <= maxAvailableRank) return;
    const fallback = [...RANGES]
      .reverse()
      .find((r) => RANGE_BOUNDS[r][0] <= maxAvailableRank);
    if (fallback) setRange(fallback);
  }, [maxAvailableRank, range, customRange]);

  const toggleGenre = useCallback((id: number) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearGenres = useCallback(() => setSelectedGenres(new Set()), []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setSelectedGenres(new Set());
    setFavoritesOnly(false);
    // deep 조회 실패로 스코프가 top으로 되돌아간 상태에서 딥 구간이 남아있는 등
    // 어떤 조합에서도 확실한 탈출구가 되도록 범위(프리셋·커스텀)도 초기화
    setRange("top100");
    setCustomRange(null);
  }, []);

  const filteredGames = useMemo(() => {
    const [min, max] = customRange ?? RANGE_BOUNDS[range];
    const q = search.trim().toLowerCase();
    return snapshot.games.filter((g) => {
      if (g.rank < min || g.rank > max) return false;
      if (
        selectedGenres.size > 0 &&
        !g.genreIds.some((id) => selectedGenres.has(id))
      ) {
        return false;
      }
      if (
        q &&
        !g.name.toLowerCase().includes(q) &&
        !g.nameEn.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (favoritesOnly && !favorites.has(g.appid)) return false;
      return true;
    });
  }, [
    snapshot.games,
    range,
    customRange,
    selectedGenres,
    search,
    favoritesOnly,
    favorites,
  ]);

  const updatedTime = mounted
    ? new Date(snapshot.updatedAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  // 공유 카드용 라벨 (커스텀 범위 반영, TopBar의 범위 라벨 규칙과 동일)
  const rangeLabelText = customRange
    ? tControls("rangeBand", { lo: customRange[0], hi: customRange[1] })
    : range === "top100"
      ? tControls("rangeTop100")
      : tControls("rangeBand", {
          lo: RANGE_BOUNDS[range][0],
          hi: RANGE_BOUNDS[range][1],
        });
  const periodLabelText = tControls(PERIOD_LABEL_KEY[period]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 바 — 문서 레벨 sticky: 랭킹 테이블로 스크롤해도 필터·검색·기간 유지 */}
      <div ref={headerRef} className="sticky top-0 z-30">
        <TopBar
          period={period}
          onPeriodChange={setPeriod}
          range={range}
          onRangeChange={selectPreset}
          customRange={customRange}
          onApplyCustom={applyCustomRange}
          maxAvailableRank={maxAvailableRank}
          genres={genres}
          selectedGenres={selectedGenres}
          onToggleGenre={toggleGenre}
          onClearGenres={clearGenres}
          search={search}
          onSearchChange={setSearch}
          allGames={snapshot.games}
          favoritesOnly={favoritesOnly}
          onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
          settings={settings}
          onUpdateSettings={updateSettings}
          currency={currency}
          onCurrencyChange={changeCurrency}
          onSelectGame={setSelectedGame}
        />
      </div>

      {/* 첫 화면 = 버블맵 + 상태 스트립 (헤더를 뺀 뷰포트 높이) */}
      <div
        className="flex flex-col"
        style={{ height: `calc(100dvh - ${headerH}px)` }}
      >
        <div className="relative min-h-0 flex-1">
          {filteredGames.length === 0 ? (
            // 재조회 중(예: 딥 밴드 첫 선택)에는 빈 결과가 잠정 상태 — 스피너만 보이고
            // "조건에 맞는 게임이 없습니다" 플래시를 띄우지 않는다
            loading ? null : (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <p className="text-sm text-neutral-500">
                  {tControls("noResults")}
                </p>
                <button
                  onClick={clearFilters}
                  className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                >
                  {tControls("clearFilters")}
                </button>
              </div>
            )
          ) : (
            <BubbleMap
              games={filteredGames}
              sizeBy={settings.sizeBy}
              colorBy={settings.colorBy}
              showName={settings.showName}
              showChange={settings.showChange}
              onSelect={setSelectedGame}
              onReady={handleMapReady}
              className="h-full w-full"
            />
          )}
          {/* 공유/스크린샷 — 맵 우하단, 화면 초기화 버튼 위에 스택. 맵이 있을 때만 */}
          {filteredGames.length > 0 && (
            <button
              onClick={() => setShareOpen(true)}
              aria-label={tShare("button")}
              title={tShare("button")}
              className="absolute bottom-16 right-3 z-10 rounded-full border border-[#16c784]/50 bg-[#0a0a0f]/80 p-2.5 text-[#16c784] shadow-lg backdrop-blur-sm transition-colors hover:bg-[#16c784]/15 active:scale-95"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 2.2v7.3" />
                <path d="M5.5 4.5 8 2l2.5 2.5" />
                <path d="M4 7.2H3.4v5.4a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1V7.2H12" />
              </svg>
            </button>
          )}
          {/* 버블 뽑기 FAB — 재방문 콘텐츠 (해자 ③ 공유 포맷). 맵 좌하단, 우하단 리셋 버튼과 대칭 */}
          <button
            onClick={openDraw}
            className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border border-[#16c784]/50 bg-[#0a0a0f]/80 px-3.5 py-2.5 text-sm font-semibold text-[#16c784] shadow-lg backdrop-blur-sm transition-colors hover:bg-[#16c784]/15 active:scale-95"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <rect x="2" y="2" width="12" height="12" rx="3" />
              <circle cx="5.7" cy="5.7" r="1" fill="currentColor" stroke="none" />
              <circle cx="10.3" cy="5.7" r="1" fill="currentColor" stroke="none" />
              <circle cx="5.7" cy="10.3" r="1" fill="currentColor" stroke="none" />
              <circle cx="10.3" cy="10.3" r="1" fill="currentColor" stroke="none" />
            </svg>
            {tDraw("fab")}
          </button>
          {loading && (
            <div className="absolute inset-0 z-20 bg-[#0a0a0f]/60">
              <LoadingIndicator />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
          {snapshot.mock && (
            <span className="rounded bg-[#fbbf24]/15 px-1.5 py-0.5 font-medium text-[#fbbf24]">
              {tCommon("mockBadge")}
            </span>
          )}
          {mounted && <span>{tCommon("updatedAt", { time: updatedTime })}</span>}
          {snapshot.priceDataStale && (
            <span className="text-neutral-600">
              {tCommon("priceUnavailable")}
            </span>
          )}
          {/* 맵이 터치 스와이프를 소비해 아래 테이블을 발견하기 어려움(특히 모바일) — 바로가기 */}
          <a
            href="#ranking"
            className="ml-auto shrink-0 whitespace-nowrap text-neutral-400 hover:text-neutral-200"
          >
            {tTable("title")} ↓
          </a>
        </div>
      </div>

      {/* 페이지 스크롤 영역: 랭킹 테이블 */}
      <RankingTable
        games={filteredGames}
        priceDataStale={snapshot.priceDataStale}
        onSelect={setSelectedGame}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        topOffset={headerH}
      />

      {/* 버블 뽑기 — 후보는 스냅샷 전체(화면 필터와 독립), 당첨작 상세는 GameModal 재사용 */}
      <BubbleDraw
        open={drawOpen}
        games={snapshot.games}
        onClose={() => setDrawOpen(false)}
        onViewDetail={(game) => {
          setDrawOpen(false);
          setSelectedGame(game);
        }}
      />

      {/* 공유 이미지 — 현재 버블맵 뷰포트를 브랜드 카드로 캡처 */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        capture={captureMap}
        games={filteredGames}
        rangeLabel={rangeLabelText}
        periodLabel={periodLabelText}
        updatedTime={updatedTime}
      />

      {/* key로 게임 전환 시 모달을 리마운트 — 이전 게임의 추이/이미지 상태 잔상 방지 */}
      <GameModal
        key={selectedGame?.appid ?? "closed"}
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        isFavorite={
          selectedGame !== null && favorites.has(selectedGame.appid)
        }
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
