import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ALL_LOCALES,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import { getBubbleSnapshot } from "@/lib/data";
import type { Currency, GameBubbleData } from "@/lib/types";
import {
  formatChangePct,
  formatPlayersFull,
  formatPrice,
} from "@/lib/format";

// 게임 상세 — Phase 4에서 본격 구현 (추이 차트·자연문·SEO). 현재는 실데이터 최소 표시.

type Props = {
  params: Promise<{ locale: string; appid: string }>;
};

function toLocale(raw: string): Locale {
  return hasLocale(ALL_LOCALES, raw) ? raw : DEFAULT_LOCALE;
}

async function resolveCurrency(locale: Locale): Promise<Currency> {
  const raw = (await cookies()).get(CURRENCY_COOKIE)?.value;
  return raw === "KRW" || raw === "USD" ? raw : DEFAULT_CURRENCY[locale];
}

// generateMetadata와 페이지 본문의 중복 조회 제거 (요청 단위 캐시)
const loadSnapshot = cache((locale: Locale, currency: Currency) =>
  getBubbleSnapshot({ period: "24h", currency, locale }),
);

async function loadGame(
  locale: Locale,
  currency: Currency,
  rawAppid: string,
): Promise<{ game: GameBubbleData | null; priceDataStale: boolean }> {
  const appid = Number.parseInt(rawAppid, 10);
  if (!Number.isInteger(appid) || appid <= 0) {
    return { game: null, priceDataStale: false };
  }
  const snapshot = await loadSnapshot(locale, currency);
  return {
    game: snapshot.games.find((g) => g.appid === appid) ?? null,
    priceDataStale: snapshot.priceDataStale,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, appid } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "site" });
  const currency = await resolveCurrency(locale);
  const { game } = await loadGame(locale, currency, appid);
  return {
    title: game ? `${game.name} — ${t("title")}` : t("title"),
  };
}

export default async function GameDetailPage({ params }: Props) {
  const { locale: rawLocale, appid } = await params;
  setRequestLocale(rawLocale);
  const locale = toLocale(rawLocale);
  const currency = await resolveCurrency(locale);
  const { game, priceDataStale } = await loadGame(locale, currency, appid);
  if (!game) notFound();

  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-neutral-400 hover:text-neutral-200"
      >
        ← {t("detail.backHome")}
      </Link>

      {game.headerImage && (
        // 스팀 CDN 외부 이미지 — Phase 4에서 next/image 도메인 설정과 함께 정리
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.headerImage}
          alt={game.name}
          className="mb-4 w-full rounded-lg border border-neutral-800"
        />
      )}

      <h1 className="text-2xl font-bold text-neutral-100">{game.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {t("modal.rank", { rank: game.rank })}
        {game.nameEn !== game.name && ` · ${game.nameEn}`}
      </p>

      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-500">{t("modal.players")}</dt>
          <dd className="text-lg font-semibold text-neutral-100">
            {formatPlayersFull(game.players, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{t("modal.peak24h")}</dt>
          <dd className="text-lg font-semibold text-neutral-100">
            {formatPlayersFull(game.peak24h, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{t("table.change")}</dt>
          <dd
            className={`text-lg font-semibold ${
              game.changePct === null
                ? "text-neutral-500"
                : game.changePct >= 0
                  ? "text-[#16c784]"
                  : "text-[#ea3943]"
            }`}
          >
            {game.changePct === null ? "—" : formatChangePct(game.changePct)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{t("modal.reviews")}</dt>
          <dd className="text-sm font-semibold text-neutral-100">
            {t(`reviewScore.${game.reviewScore}`)}
          </dd>
          <dd className="text-xs text-neutral-500">
            {t("modal.totalReviews", { count: game.totalReviews })}
          </dd>
        </div>
      </dl>

      {/* 가격 — stale이면 블록 전체 숨김 (우아한 강등, CLAUDE.md 3-3) */}
      {!priceDataStale && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <span className="text-xs text-neutral-500">{t("modal.price")}</span>
          {game.isFree ? (
            <span className="text-sm font-semibold text-neutral-100">
              {t("common.free")}
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
              {t("common.priceUnavailable")}
            </span>
          )}
        </div>
      )}

      <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-500">
        {t("detail.wip")}
      </p>
    </main>
  );
}
