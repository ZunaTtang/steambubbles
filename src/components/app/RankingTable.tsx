"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { GameBubbleData } from "@/lib/types";
import { formatChangePct, formatPlayersFull, formatPrice } from "@/lib/format";

type SortKey =
  | "rank"
  | "game"
  | "players"
  | "peak24h"
  | "change"
  | "price"
  | "discount"
  | "rating";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 100;

interface RankingTableProps {
  games: GameBubbleData[];
  // true면 가격·할인 컬럼 전체 숨김 (CLAUDE.md 3-3 우아한 강등)
  priceDataStale: boolean;
  onSelect: (game: GameBubbleData) => void;
  favorites: Set<number>;
  onToggleFavorite: (appid: number) => void;
  // sticky 상단 바 높이 — "#ranking" 앵커 점프가 바에 가리지 않도록 scroll-margin 보정
  topOffset?: number;
}

// 정렬용 값 추출 — null 가격은 최하위, 무료는 0
function sortValue(g: GameBubbleData, key: SortKey): number | string {
  switch (key) {
    case "rank":
      return g.rank;
    case "game":
      return g.name;
    case "players":
      return g.players;
    case "peak24h":
      return g.peak24h;
    case "change":
      return g.changePct ?? Number.NEGATIVE_INFINITY;
    case "price":
      return g.price ? g.price.final : g.isFree ? 0 : -1;
    case "discount":
      return g.price?.discountPct ?? 0;
    case "rating":
      return g.reviewScore;
  }
}

function ratingColor(score: number): string {
  if (score === 0) return "text-neutral-500";
  if (score >= 8) return "text-[#16c784]";
  if (score >= 5) return "text-[#fbbf24]";
  return "text-[#ea3943]";
}

export default function RankingTable({
  games,
  priceDataStale,
  onSelect,
  favorites,
  onToggleFavorite,
  topOffset = 0,
}: RankingTableProps) {
  const t = useTranslations("table");
  const tCommon = useTranslations("common");
  const tReview = useTranslations("reviewScore");
  const locale = useLocale() as Locale;
  const [sortKey, setSortKey] = useState<SortKey>("players");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...games].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [games, sortKey, sortDir]);

  const visible = sorted.slice(0, visibleCount);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 순위·이름은 오름차순이 자연스러움, 수치는 내림차순
      setSortDir(key === "rank" || key === "game" ? "asc" : "desc");
    }
  };

  // cls: 모바일에서 덜 중요한 컬럼 숨김 (가로 스크롤 부담 축소)
  const columns: { key: SortKey; label: string; numeric: boolean; cls?: string }[] = [
    { key: "rank", label: t("rank"), numeric: true },
    { key: "game", label: t("game"), numeric: false },
    { key: "players", label: t("players"), numeric: true },
    { key: "peak24h", label: t("peak24h"), numeric: true, cls: "hidden md:table-cell" },
    { key: "change", label: t("change"), numeric: true },
    ...(priceDataStale
      ? []
      : ([
          { key: "price", label: t("price"), numeric: true },
          { key: "discount", label: t("discount"), numeric: true },
        ] as { key: SortKey; label: string; numeric: boolean }[])),
    { key: "rating", label: t("rating"), numeric: false },
  ];

  return (
    <section
      id="ranking"
      className="px-3 py-6"
      style={{ scrollMarginTop: topOffset + 8 }}
    >
      <h2 className="mb-3 text-base font-bold text-neutral-200">
        {t("title")}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[560px] border-collapse text-sm md:min-w-[720px]">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs text-neutral-500">
              <th className="w-8 px-2 py-2" aria-label="★" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-medium ${
                    col.numeric ? "text-right" : "text-left"
                  }${col.cls ? ` ${col.cls}` : ""}`}
                >
                  <button
                    onClick={() => handleSort(col.key)}
                    className="whitespace-nowrap hover:text-neutral-200"
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-0.5">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => {
              const isFav = favorites.has(g.appid);
              return (
                <tr
                  key={g.appid}
                  onClick={() => onSelect(g)}
                  className="cursor-pointer border-b border-neutral-800/60 last:border-b-0 hover:bg-neutral-900/60"
                >
                  <td className="px-2 py-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(g.appid);
                      }}
                      aria-pressed={isFav}
                      className={
                        isFav
                          ? "text-[#fbbf24]"
                          : "text-neutral-700 hover:text-neutral-400"
                      }
                    >
                      ★
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
                    {g.rank}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      {g.headerImage && (
                        // 스팀 CDN 썸네일 — 작은 장식 이미지
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.headerImage}
                          alt=""
                          loading="lazy"
                          className="h-6 w-[52px] shrink-0 rounded-sm object-cover"
                        />
                      )}
                      <span className="max-w-64 truncate text-neutral-200">
                        {g.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-neutral-200">
                    {formatPlayersFull(g.players, locale)}
                  </td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums text-neutral-400 md:table-cell">
                    {formatPlayersFull(g.peak24h, locale)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      g.changePct === null
                        ? "text-neutral-600"
                        : g.changePct >= 0
                          ? "text-[#16c784]"
                          : "text-[#ea3943]"
                    }`}
                  >
                    {g.changePct === null ? "—" : formatChangePct(g.changePct)}
                  </td>
                  {!priceDataStale && (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-200">
                        {g.isFree ? (
                          <span className="text-neutral-400">
                            {tCommon("free")}
                          </span>
                        ) : g.price ? (
                          formatPrice(g.price, locale)
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {g.price && g.price.discountPct > 0 ? (
                          <span className="rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-xs font-bold text-[#fbbf24]">
                            -{g.price.discountPct}%
                          </span>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                    </>
                  )}
                  <td
                    className={`px-2 py-1.5 whitespace-nowrap text-xs ${ratingColor(g.reviewScore)}`}
                  >
                    {tReview(String(g.reviewScore))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visibleCount < sorted.length && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-md border border-neutral-800 px-4 py-1.5 text-sm text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            {t("loadMore", { count: sorted.length - visibleCount })}
          </button>
        </div>
      )}
    </section>
  );
}
