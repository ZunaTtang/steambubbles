"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CURRENCY_COOKIE } from "@/i18n/locales";
import type {
  BubbleSnapshot,
  Currency,
  GameBubbleData,
  GenreOption,
  Period,
  RangeKey,
} from "@/lib/types";
import { RANGE_BOUNDS } from "@/lib/types";
import { useFavorites, useSettings } from "./hooks";
import TopBar from "./TopBar";
import GameModal from "./GameModal";
import RankingTable from "./RankingTable";
import BubbleDraw from "./BubbleDraw";

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

  const [period, setPeriod] = useState<Period>("24h");
  const [range, setRange] = useState<RangeKey>("top100");
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

  const { settings, update: updateSettings } = useSettings();
  const { favorites, toggle: toggleFavorite } = useFavorites();

  // 현재 snapshot이 실제로 대표하는 조합. 첫 렌더는 서버 initialSnapshot(24h·initialCurrency)이므로
  // 이 값과 일치하면 재조회를 건너뛴다 — StrictMode 이중 마운트/오류 후 되돌림에도 값 기반이라 안전.
  const appliedRef = useRef({ period, currency, locale });
  useEffect(() => {
    if (
      appliedRef.current.period === period &&
      appliedRef.current.currency === currency &&
      appliedRef.current.locale === locale
    ) {
      return;
    }
    const ctrl = new AbortController();
    const reqPeriod = period;
    const reqCurrency = currency;
    const reqLocale = locale;
    setLoading(true);
    fetch(
      `/api/bubbles?period=${reqPeriod}&currency=${reqCurrency}&locale=${reqLocale}`,
      { signal: ctrl.signal },
    )
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: BubbleSnapshot) => {
        setSnapshot(data);
        // 통화는 SSR이 읽어야 하므로 쿠키 저장 (localStorage 금지 — CLAUDE.md 7).
        // 성공적으로 반영된 통화만 저장해 쿠키와 표시 데이터가 어긋나지 않게 한다.
        if (reqCurrency !== appliedRef.current.currency) {
          document.cookie = `${CURRENCY_COOKIE}=${reqCurrency}; path=/; max-age=31536000; samesite=lax`;
        }
        appliedRef.current = {
          period: reqPeriod,
          currency: reqCurrency,
          locale: reqLocale,
        };
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return; // 재요청/언마운트 — 정상
        // 실패: 기간/통화 선택을 실제 표시 중인 데이터로 되돌려 오라벨(잘못된 라벨) 방지
        setLoading(false);
        setPeriod(appliedRef.current.period);
        setCurrency(appliedRef.current.currency);
      });
    return () => ctrl.abort();
  }, [period, currency, locale]);

  // 통화 변경은 낙관적 UI만 — 쿠키는 재조회 성공 시 기록한다
  const changeCurrency = useCallback((next: Currency) => {
    setCurrency(next);
  }, []);

  // updatedAt는 클라이언트 로컬 타임존으로만 렌더 — 서버(UTC)에서 포맷해 굳으면 KST 유저에게 오시각 표시
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
  }, []);

  const filteredGames = useMemo(() => {
    const [min, max] = RANGE_BOUNDS[range];
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
  }, [snapshot.games, range, selectedGenres, search, favoritesOnly, favorites]);

  const updatedTime = mounted
    ? new Date(snapshot.updatedAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex min-h-screen flex-col">
      {/* 첫 화면 = 상단 바 + 버블맵 + 상태 스트립 (풀 뷰포트) */}
      <div className="flex h-dvh flex-col">
        <TopBar
          period={period}
          onPeriodChange={setPeriod}
          range={range}
          onRangeChange={setRange}
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

        <div className="relative min-h-0 flex-1">
          {filteredGames.length === 0 ? (
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
          ) : (
            <BubbleMap
              games={filteredGames}
              sizeBy={settings.sizeBy}
              colorBy={settings.colorBy}
              showName={settings.showName}
              showChange={settings.showChange}
              onSelect={setSelectedGame}
              className="h-full w-full"
            />
          )}
          {/* 버블 뽑기 FAB — 재방문 콘텐츠 (해자 ③ 공유 포맷). 맵 좌하단, 우하단 리셋 버튼과 대칭 */}
          <button
            onClick={() => setDrawOpen(true)}
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
