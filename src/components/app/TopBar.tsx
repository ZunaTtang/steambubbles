"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type {
  BubbleSettings,
  ColorBy,
  Currency,
  GameBubbleData,
  GenreOption,
  Period,
  RangeKey,
  SizeBy,
} from "@/lib/types";
import { PERIODS, RANGES, RANGE_BOUNDS } from "@/lib/types";

const PERIOD_LABEL_KEY: Record<Period, string> = {
  "24h": "period24h",
  "7d": "period7d",
  "30d": "period30d",
};

interface TopBarProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  // 실측 최대 랭크 (deep 스냅샷 적용 후) — null이면 미지(전 구간 노출).
  // 추적 데이터 밖 구간(예: 최대 2,608위인데 2,751~3,000)을 숨겨 데드엔드 방지
  maxAvailableRank: number | null;
  genres: GenreOption[];
  selectedGenres: Set<number>;
  onToggleGenre: (id: number) => void;
  onClearGenres: () => void;
  search: string;
  onSearchChange: (q: string) => void;
  // 자동완성 후보는 필터 전 전체 스냅샷 기준
  allGames: GameBubbleData[];
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  settings: BubbleSettings;
  onUpdateSettings: (partial: Partial<BubbleSettings>) => void;
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  onSelectGame: (game: GameBubbleData) => void;
}

export default function TopBar({
  period,
  onPeriodChange,
  range,
  onRangeChange,
  maxAvailableRank,
  genres,
  selectedGenres,
  onToggleGenre,
  onClearGenres,
  search,
  onSearchChange,
  allGames,
  favoritesOnly,
  onToggleFavoritesOnly,
  settings,
  onUpdateSettings,
  currency,
  onCurrencyChange,
  onSelectGame,
}: TopBarProps) {
  const t = useTranslations("controls");
  const tSite = useTranslations("site");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 범위 라벨 — Top 100만 고정 키, 나머지는 구간 템플릿 (Tier 3 오픈으로 13구간 — 키 증식 방지)
  const rangeLabel = (r: RangeKey) =>
    r === "top100"
      ? t("rangeTop100")
      : t("rangeBand", { lo: RANGE_BOUNDS[r][0], hi: RANGE_BOUNDS[r][1] });

  // 실측 최대를 아는 상태(deep 적용 후)면 데이터 밖 구간은 목록에서 제외
  const visibleRanges =
    maxAvailableRank === null
      ? RANGES
      : RANGES.filter((r) => RANGE_BOUNDS[r][0] <= maxAvailableRank);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allGames
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.nameEn.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [allGames, search]);

  const showDropdown = searchFocused && suggestions.length > 0;

  return (
    <header className="z-30 border-b border-neutral-800 bg-[#0a0a0f]">
      {/* 1행: 타이틀 / 기간 탭 / 검색 / 필터 토글(모바일) / 설정 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <h1 className="hidden whitespace-nowrap text-sm font-bold tracking-tight text-neutral-200 sm:block">
          {tSite("title")}
        </h1>

        <div
          role="tablist"
          className="flex shrink-0 overflow-hidden rounded-md border border-neutral-800"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => onPeriodChange(p)}
              className={`px-2.5 py-1.5 text-xs transition-colors md:py-1 ${
                period === p
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              }`}
            >
              {t(PERIOD_LABEL_KEY[p])}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-40 min-w-0 flex-1 sm:max-w-64">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none md:py-1"
          />
          {showDropdown && (
            <ul className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
              {suggestions.map((g) => (
                <li key={g.appid}>
                  <button
                    // blur보다 먼저 발화하도록 mousedown 사용
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelectGame(g);
                      setSearchFocused(false);
                    }}
                    className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                  >
                    <span className="truncate">{g.name}</span>
                    {g.nameEn !== g.name && (
                      <span className="truncate text-xs text-neutral-500">
                        {g.nameEn}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {routing.locales.length > 1 && (
          <div
            className="flex shrink-0 overflow-hidden rounded-md border border-neutral-800"
            role="group"
            aria-label="Language"
          >
            {routing.locales.map((l) => (
              <button
                key={l}
                onClick={() => router.replace(pathname, { locale: l })}
                aria-pressed={locale === l}
                className={`px-2 py-1.5 text-xs uppercase transition-colors md:py-1 ${
                  locale === l
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        <div className="relative shrink-0">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className={`rounded-md border px-2.5 py-1.5 text-xs md:py-1 ${
              settingsOpen
                ? "border-neutral-600 text-neutral-200"
                : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("settings")}
          </button>
          {settingsOpen && (
            <>
              {/* 외부 클릭 닫기용 백드롭 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSettingsOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm shadow-xl">
                <fieldset className="mb-3">
                  <legend className="mb-1 text-xs text-neutral-500">
                    {t("sizeBy")}
                  </legend>
                  {(
                    [
                      ["players", "sizeByPlayers"],
                      ["peak24h", "sizeByPeak"],
                    ] as [SizeBy, string][]
                  ).map(([value, key]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 py-0.5 text-neutral-300"
                    >
                      <input
                        type="radio"
                        name="sizeBy"
                        checked={settings.sizeBy === value}
                        onChange={() => onUpdateSettings({ sizeBy: value })}
                        className="accent-[#16c784]"
                      />
                      {t(key)}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="mb-3">
                  <legend className="mb-1 text-xs text-neutral-500">
                    {t("colorBy")}
                  </legend>
                  {(
                    [
                      ["change", "colorByChange"],
                      ["review", "colorByReview"],
                    ] as [ColorBy, string][]
                  ).map(([value, key]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 py-0.5 text-neutral-300"
                    >
                      <input
                        type="radio"
                        name="colorBy"
                        checked={settings.colorBy === value}
                        onChange={() => onUpdateSettings({ colorBy: value })}
                        className="accent-[#16c784]"
                      />
                      {t(key)}
                    </label>
                  ))}
                </fieldset>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-neutral-300">
                  <input
                    type="checkbox"
                    checked={settings.showName}
                    onChange={(e) =>
                      onUpdateSettings({ showName: e.target.checked })
                    }
                    className="accent-[#16c784]"
                  />
                  {t("showName")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-neutral-300">
                  <input
                    type="checkbox"
                    checked={settings.showChange}
                    onChange={(e) =>
                      onUpdateSettings({ showChange: e.target.checked })
                    }
                    className="accent-[#16c784]"
                  />
                  {t("showChange")}
                </label>
                <label className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-800 pt-3 text-neutral-300">
                  <span className="text-xs text-neutral-500">
                    {t("currency")}
                  </span>
                  <select
                    value={currency}
                    onChange={(e) =>
                      onCurrencyChange(e.target.value as Currency)
                    }
                    className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-200"
                  >
                    <option value="KRW">KRW</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2행: 범위 / 즐겨찾기 / 장르 칩 — 상시 노출, 모바일에서는 행 전체 가로 스크롤
          (접힘 토글은 필터 발견성을 해쳐 폐기 — 2026-07 모바일 UX 결정) */}
      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:overflow-x-visible md:[scrollbar-width:thin]">
        {/* 13구간(Tier 3 오픈)이라 칩 대신 셀렉트 — CLAUDE.md 5-1이 예정한 전환 */}
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value as RangeKey)}
          aria-label={t("range")}
          className="shrink-0 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 focus:border-neutral-600 focus:outline-none md:py-1"
        >
          {visibleRanges.map((r) => (
            <option key={r} value={r}>
              {rangeLabel(r)}
            </option>
          ))}
        </select>

        <button
          onClick={onToggleFavoritesOnly}
          aria-pressed={favoritesOnly}
          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap md:py-1 ${
            favoritesOnly
              ? "border-[#fbbf24]/60 bg-[#fbbf24]/10 text-[#fbbf24]"
              : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          ★ {t("favoritesOnly")}
        </button>

        {/* 모바일: 바깥 행이 하나의 스크롤 영역 (중첩 스크롤 회피) / md+: 장르만 별도 스크롤 */}
        <div
          className="flex items-center gap-1.5 md:min-w-0 md:flex-1 md:overflow-x-auto md:[scrollbar-width:thin]"
          aria-label={t("genres")}
        >
          <button
            onClick={onClearGenres}
            className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs whitespace-nowrap md:py-1 ${
              selectedGenres.size === 0
                ? "border-[#16c784]/60 bg-[#16c784]/10 text-[#16c784]"
                : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t("allGenres")}
          </button>
          {genres.map((g) => {
            const active = selectedGenres.has(g.id);
            return (
              <button
                key={g.id}
                onClick={() => onToggleGenre(g.id)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs whitespace-nowrap md:py-1 ${
                  active
                    ? "border-[#16c784]/60 bg-[#16c784]/10 text-[#16c784]"
                    : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
