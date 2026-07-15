"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import type { GameBubbleData, TrendPoint } from "@/lib/types";
import {
  formatChangePct,
  formatPlayers,
  formatPlayersFull,
  formatPrice,
} from "@/lib/format";

interface GameModalProps {
  game: GameBubbleData | null;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (appid: number) => void;
}

export default function GameModal({
  game,
  onClose,
  isFavorite,
  onToggleFavorite,
}: GameModalProps) {
  const t = useTranslations("modal");
  const tCommon = useTranslations("common");
  const tReview = useTranslations("reviewScore");
  const tTable = useTranslations("table");
  const locale = useLocale() as Locale;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [imgError, setImgError] = useState(false);

  const appid = game?.appid;

  // 열릴 때 30일 추이 로드 (닫히거나 다른 게임 선택 시 이전 요청 중단)
  useEffect(() => {
    if (appid === undefined) return;
    setTrend(null);
    setImgError(false);
    const ctrl = new AbortController();
    fetch(`/api/trend/${appid}?days=30`, { signal: ctrl.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: TrendPoint[]) => setTrend(data))
      .catch(() => {
        // 추이는 부가 정보 — 실패 시 스켈레톤만 유지
      });
    return () => ctrl.abort();
  }, [appid]);

  // 포커스 이동 + body 스크롤 잠금
  useEffect(() => {
    if (appid === undefined) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [appid]);

  if (!game) return null;

  // 가벼운 포커스 트랩: Tab 순환 + ESC 닫기
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) {
      e.preventDefault(); // 포커스 가능한 요소가 없으면 다이얼로그 밖으로 나가지 못하게
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    // 다이얼로그 컨테이너 자신이 포커스된 초기 상태 포함 — Shift+Tab이 배경으로 새는 것을 막는다
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const changeColor =
    game.changePct === null
      ? "text-neutral-500"
      : game.changePct >= 0
        ? "text-[#16c784]"
        : "text-[#ea3943]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={game.name}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-neutral-800 bg-[#12121a] shadow-2xl focus:outline-none"
      >
        {game.headerImage && !imgError && (
          // 외부 도메인 스팀 CDN — 일반 img 사용, 로드 실패 시 숨김
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.headerImage}
            alt={game.name}
            onError={() => setImgError(true)}
            className="max-h-56 w-full object-cover"
          />
        )}

        <div className="p-4">
          <div className="mb-3 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-neutral-100">
                {game.name}
              </h2>
              <p className="text-xs text-neutral-500">
                {t("rank", { rank: game.rank })}
                {game.nameEn !== game.name && ` · ${game.nameEn}`}
              </p>
            </div>
            <button
              onClick={() => onToggleFavorite(game.appid)}
              aria-pressed={isFavorite}
              className={`shrink-0 rounded-md border px-2 py-1 text-xs ${
                isFavorite
                  ? "border-[#fbbf24]/60 bg-[#fbbf24]/10 text-[#fbbf24]"
                  : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              ★ {isFavorite ? t("unfavorite") : t("favorite")}
            </button>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="shrink-0 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
            >
              ✕
            </button>
          </div>

          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500">{t("players")}</dt>
              <dd className="text-base font-semibold text-neutral-100">
                {formatPlayers(game.players)}
              </dd>
              <dd className="text-xs text-neutral-500">
                {formatPlayersFull(game.players, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t("peak24h")}</dt>
              <dd className="text-base font-semibold text-neutral-100">
                {formatPlayers(game.peak24h)}
              </dd>
              <dd className="text-xs text-neutral-500">
                {formatPlayersFull(game.peak24h, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{tTable("change")}</dt>
              <dd className={`text-base font-semibold ${changeColor}`}>
                {game.changePct === null ? "—" : formatChangePct(game.changePct)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t("reviews")}</dt>
              <dd className="text-sm font-semibold text-neutral-100">
                {tReview(String(game.reviewScore))}
              </dd>
              <dd className="text-xs text-neutral-500">
                {t("totalReviews", { count: game.totalReviews })}
              </dd>
            </div>
          </dl>

          <div className="mb-4 flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
            <span className="text-xs text-neutral-500">{t("price")}</span>
            {game.isFree ? (
              <span className="text-sm font-semibold text-neutral-100">
                {tCommon("free")}
              </span>
            ) : game.price ? (
              <span className="flex items-baseline gap-2">
                {game.price.discountPct > 0 && (
                  <>
                    <span className="text-xs text-neutral-500 line-through">
                      {formatPrice(
                        { ...game.price, final: game.price.initial },
                        locale,
                      )}
                    </span>
                    <span className="rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-xs font-bold text-[#fbbf24]">
                      -{game.price.discountPct}%
                    </span>
                  </>
                )}
                <span className="text-sm font-semibold text-neutral-100">
                  {formatPrice(game.price, locale)}
                </span>
              </span>
            ) : (
              <span className="text-sm text-neutral-500">
                {tCommon("priceUnavailable")}
              </span>
            )}
          </div>

          <div className="mb-4">
            <p className="mb-1 text-xs text-neutral-500">{t("trend")}</p>
            {trend === null ? (
              <div className="h-[120px] w-full animate-pulse rounded-md bg-neutral-800/60" />
            ) : (
              <Sparkline points={trend} />
            )}
          </div>

          {/* 모달 → 상세 페이지 딥링크 (SEO 유입구, CLAUDE.md 5-1) */}
          <Link
            href={`/game/${game.appid}`}
            className="block w-full rounded-md bg-[#16c784]/15 px-3 py-2 text-center text-sm font-semibold text-[#16c784] hover:bg-[#16c784]/25"
          >
            {t("detailLink")} →
          </Link>
        </div>
      </div>
    </div>
  );
}

// 30일 avg 추이 스파크라인 (인라인 SVG, area + line)
function Sparkline({ points }: { points: TrendPoint[] }) {
  const W = 560;
  const H = 120;
  const LEFT = 46; // min/max 라벨 거터
  const PAD = 8;

  if (points.length === 0) {
    return <div className="h-[120px] w-full rounded-md bg-neutral-900" />;
  }

  const values = points.map((p) => p.avg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - LEFT - PAD) / Math.max(points.length - 1, 1);
  const yOf = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const coords = points.map(
    (p, i) => `${(LEFT + i * stepX).toFixed(1)},${yOf(p.avg).toFixed(1)}`,
  );
  const line = `M${coords.join("L")}`;
  const lastX = (LEFT + (points.length - 1) * stepX).toFixed(1);
  const area = `${line}L${lastX},${H - PAD}L${LEFT},${H - PAD}Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full rounded-md bg-neutral-900"
      role="img"
    >
      <path d={area} fill="#16c784" opacity={0.12} />
      <path d={line} fill="none" stroke="#16c784" strokeWidth={1.5} />
      <text x={LEFT - 6} y={PAD + 4} textAnchor="end" fontSize={10} fill="#737373">
        {formatPlayers(max)}
      </text>
      <text x={LEFT - 6} y={H - PAD} textAnchor="end" fontSize={10} fill="#737373">
        {formatPlayers(min)}
      </text>
    </svg>
  );
}
