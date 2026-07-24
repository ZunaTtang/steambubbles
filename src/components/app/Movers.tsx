"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { GameBubbleData, Period } from "@/lib/types";
import {
  formatChangePct,
  formatPlayerDelta,
  formatPlayersFull,
} from "@/lib/format";
import { moverDelta, reasonTag, topMovers, type ReasonTag } from "@/lib/movers";
import MoversShareModal from "./MoversShareModal";

// 오늘의 무버스 (CLAUDE.md 5-1 확장 콘텐츠) — 급상승/급락 TOP + "왜" 태그.
// 범위 필터와 독립인 전역 컷. 클릭 → GameModal 재사용. 공유 버튼 → /og/movers 이미지.

const GREEN = "#16c784";
const RED = "#ea3943";

interface MoversProps {
  games: GameBubbleData[];
  period: Period;
  onSelect: (game: GameBubbleData) => void;
}

export default function Movers({ games, period, onSelect }: MoversProps) {
  const t = useTranslations("movers");
  const tc = useTranslations("controls");
  const locale = useLocale() as Locale;
  const periodLabel = tc(
    period === "24h" ? "period24h" : period === "7d" ? "period7d" : "period30d",
  );
  // 시간 의존 태그(new)는 마운트 후에만 (하이드레이션 불일치 방지)
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => setNowMs(Date.now()), []);
  const [shareOpen, setShareOpen] = useState(false);

  const gainers = useMemo(() => topMovers(games, "up", 8), [games]);
  const losers = useMemo(() => topMovers(games, "down", 8), [games]);

  if (gainers.length === 0 && losers.length === 0) {
    return (
      <section className="px-3 py-6">
        <h2 className="mb-2 text-base font-bold text-neutral-200">
          {t("heading")}
        </h2>
        <p className="text-sm text-neutral-500">{t("empty")}</p>
      </section>
    );
  }

  return (
    <section className="px-3 py-6">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-neutral-200">{t("heading")}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {t("basis", { period: periodLabel })}
          </p>
        </div>
        {gainers.length > 0 && (
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-[#16c784]/50 bg-[#16c784]/10 px-2.5 py-1.5 text-xs font-semibold text-[#16c784] transition hover:bg-[#16c784]/20 active:scale-[0.98] md:py-1"
          >
            <svg
              width="14"
              height="14"
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
            {t("share")}
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MoverList
          title={t("gainers")}
          up
          items={gainers}
          nowMs={nowMs}
          locale={locale}
          onSelect={onSelect}
        />
        <MoverList
          title={t("losers")}
          up={false}
          items={losers}
          nowMs={nowMs}
          locale={locale}
          onSelect={onSelect}
        />
      </div>

      <MoversShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        period={period}
      />
    </section>
  );
}

function MoverList({
  title,
  up,
  items,
  nowMs,
  locale,
  onSelect,
}: {
  title: string;
  up: boolean;
  items: GameBubbleData[];
  nowMs: number;
  locale: Locale;
  onSelect: (game: GameBubbleData) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <div
        className="border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold"
        style={{ color: up ? GREEN : RED }}
      >
        {up ? "▲ " : "▼ "}
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-neutral-600">—</div>
      ) : (
        <ul>
          {items.map((g) => (
            <li key={g.appid}>
              <MoverRow g={g} up={up} nowMs={nowMs} locale={locale} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MoverRow({
  g,
  up,
  nowMs,
  locale,
  onSelect,
}: {
  g: GameBubbleData;
  up: boolean;
  nowMs: number;
  locale: Locale;
  onSelect: (game: GameBubbleData) => void;
}) {
  const tag = reasonTag(g, nowMs);
  return (
    <button
      onClick={() => onSelect(g)}
      className="flex w-full items-center gap-2.5 border-b border-neutral-800/60 px-3 py-2 text-left last:border-b-0 hover:bg-neutral-900/60"
    >
      <span
        className="w-[88px] shrink-0 text-right text-[13px] font-bold tabular-nums whitespace-nowrap"
        style={{ color: up ? GREEN : RED }}
      >
        {formatPlayerDelta(moverDelta(g), locale)}
      </span>
      <MoverArt game={g} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-200">{g.name}</span>
        <span className="block text-xs text-neutral-500">
          {formatPlayersFull(g.players, locale)} · #{g.rank}
          {g.changePct !== null && ` · ${formatChangePct(g.changePct)}`}
        </span>
      </span>
      {tag && <TagChip tag={tag} />}
    </button>
  );
}

function TagChip({ tag }: { tag: ReasonTag }) {
  const t = useTranslations("movers");
  const style: Record<string, string> = {
    sale: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fbbf24]",
    new: "border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]",
    surge: "border-[#16c784]/40 bg-[#16c784]/10 text-[#16c784]",
  };
  const label =
    tag.key === "sale"
      ? t("tagSale", { pct: tag.discount ?? 0 })
      : tag.key === "new"
        ? t("tagNew")
        : t("tagSurge");
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${style[tag.key]}`}
    >
      {label}
    </span>
  );
}

function MoverArt({ game }: { game: GameBubbleData }) {
  const [err, setErr] = useState(false);
  if (game.headerImage && !err) {
    return (
      // 스팀 CDN 썸네일 — 작은 장식 이미지
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={game.headerImage}
        alt=""
        loading="lazy"
        onError={() => setErr(true)}
        className="h-6 w-[52px] shrink-0 rounded-sm object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-[52px] shrink-0 items-center justify-center rounded-sm bg-neutral-800 text-xs font-bold text-neutral-500">
      {game.name.slice(0, 2)}
    </span>
  );
}
