import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ALL_LOCALES,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import {
  getBubbleSnapshot,
  getGameDetail,
  getGenreOptions,
  getTrend,
} from "@/lib/data";
import type { Currency, GameBubbleData, TrendPoint } from "@/lib/types";
import {
  formatChangePct,
  formatPlayersFull,
  formatPrice,
  formatSharePct,
} from "@/lib/format";
import { buildAlternates, getSiteUrl } from "@/lib/site";
import DetailBackBar from "@/components/app/DetailBackBar";

// 게임 상세 (CLAUDE.md 5-3) — 자연문 콘텐츠 + 추이 + SEO 메타/구조화 데이터.
// 쿠키 통화 대신 로케일 기본 통화로 렌더 → 정적 프리렌더/ISR 가능 (SEO 유리).

export const revalidate = 1800; // ISR 30분 (CLAUDE.md 4-3)
// 빌드 시 상세 페이지를 사전생성하지 않는다: 로케일 다중화로 페이지가 배수가 되면 빌드가
// Neon(scale-to-zero)에 쿼리를 몰아쳐 연결 리셋으로 실패한다. 전부 on-demand ISR로 렌더하고
// (첫 방문 시 생성 후 30분 캐시) sitemap에 등재해 색인은 그대로 확보한다.
export const dynamicParams = true;

type Props = {
  params: Promise<{ locale: string; appid: string }>;
};

export function generateStaticParams() {
  return [];
}

function toLocale(raw: string): Locale {
  return hasLocale(ALL_LOCALES, raw) ? raw : DEFAULT_LOCALE;
}

function parseAppid(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 2_147_483_647 ? n : null;
}

// deep 스코프 — Tier 3(1,001~3,000위) 게임 상세도 렌더되도록 (top 스냅샷만 보면 404)
const loadSnapshot = cache((locale: Locale, currency: Currency) =>
  getBubbleSnapshot({ period: "24h", currency, locale, scope: "deep" }),
);

async function loadGame(
  locale: Locale,
  appid: number,
): Promise<{
  game: GameBubbleData | null;
  priceDataStale: boolean;
  updatedAt: string;
}> {
  const snapshot = await loadSnapshot(locale, DEFAULT_CURRENCY[locale]);
  return {
    game: snapshot.games.find((g) => g.appid === appid) ?? null,
    priceDataStale: snapshot.priceDataStale,
    updatedAt: snapshot.updatedAt,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, appid: rawAppid } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale });
  const appid = parseAppid(rawAppid);
  if (appid === null) {
    return { title: t("detail.notFound"), robots: { index: false } };
  }
  const { game } = await loadGame(locale, appid);
  if (!game) {
    return { title: t("detail.notFound"), robots: { index: false } };
  }
  const alternates = buildAlternates(`/game/${appid}`, locale);
  const title = `${game.name} ${t("detail.metaTitleSuffix")}`;
  const description = t("detail.metaDescription", {
    name: game.name,
    players: game.players,
    peak: game.peak24h,
    reviewLabel: t(`reviewScore.${game.reviewScore}`),
    rank: game.rank,
  });
  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: t("site.title"),
      type: "article",
      locale,
      images: game.headerImage ? [game.headerImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: game.headerImage ? [game.headerImage] : undefined,
    },
  };
}

// 서버 렌더 추이 스파크라인 (avg 시리즈) — 클라이언트 JS 없이 HTML에 콘텐츠 포함
function TrendChart({ points }: { points: TrendPoint[] }) {
  const w = 640;
  const h = 140;
  const pad = 8;
  const vals = points.map((p) => p.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = points.length;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, n - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const line = points.map((p, i) => `${x(i)},${y(p.avg)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${x(n - 1)},${h - pad}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full"
      role="img"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="#16c78420" />
      <polyline
        points={line}
        fill="none"
        stroke="#16c784"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 데이터 카드 — 라벨 + 값(+ 선택 뱃지). dl > div(dt/dd) 그룹은 유효 HTML
function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-neutral-100">{value}</span>
        {badge && (
          <span className="rounded bg-[#fbbf24]/15 px-1 py-0.5 text-[10px] font-bold text-[#fbbf24]">
            {badge}
          </span>
        )}
      </dd>
    </div>
  );
}

export default async function GameDetailPage({ params }: Props) {
  const { locale: rawLocale, appid: rawAppid } = await params;
  setRequestLocale(rawLocale);
  const locale = toLocale(rawLocale);
  const appid = parseAppid(rawAppid);
  if (appid === null) notFound();

  const t = await getTranslations({ locale });
  const [{ game, priceDataStale, updatedAt }, genreOptions, trend, detail] =
    await Promise.all([
      loadGame(locale, appid),
      getGenreOptions(locale),
      getTrend(appid, 30),
      getGameDetail(appid, locale),
    ]);
  if (!game) notFound();

  const reviewLabel = t(`reviewScore.${game.reviewScore}`);
  const genreMap = new Map(genreOptions.map((g) => [g.id, g.label]));
  const genreLabels = game.genreIds
    .map((id) => genreMap.get(id))
    .filter((v): v is string => Boolean(v));

  // 가격 문장 (자연문)
  let priceSentence: string;
  if (game.isFree) {
    priceSentence = t("detail.sFree");
  } else if (priceDataStale || !game.price) {
    priceSentence = t("detail.sPriceUnavailable");
  } else if (game.price.discountPct > 0) {
    priceSentence = t("detail.sPriceDiscount", {
      discount: game.price.discountPct,
      initial: formatPrice({ ...game.price, final: game.price.initial }, locale),
      price: formatPrice(game.price, locale),
    });
  } else {
    priceSentence = t("detail.sPrice", {
      price: formatPrice(game.price, locale),
    });
  }

  // 게임 소개 = Steam short_description(실콘텐츠). 미수집 시 SEO/애드센스용 폴백 문장.
  // 단, 현재/최고 동접은 줄글에 넣지 않는다(데이터 블록으로 표시) — 순위·평점·가격만.
  const fallbackIntro = [
    t("detail.sRank", { rank: game.rank }),
    game.reviewScore > 0
      ? t("detail.sReview", { label: reviewLabel, count: game.totalReviews })
      : t("detail.sReviewNone"),
    priceSentence,
  ].join(" ");
  const introText = detail.description ?? fallbackIntro;

  // 평점 긍정률 (긍정/(긍정+부정)) — 흥미 신호 바
  const polarized = detail.totalPositive + detail.totalNegative;
  const positivePct =
    polarized > 0 ? Math.round((detail.totalPositive / polarized) * 100) : null;

  const canonical = `${getSiteUrl()}/${locale}/game/${appid}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.name,
    url: canonical,
    inLanguage: locale,
  };
  if (game.headerImage) jsonLd.image = game.headerImage;
  if (genreLabels.length > 0) jsonLd.genre = genreLabels;
  if (!game.isFree && game.price && !priceDataStale) {
    jsonLd.offers = {
      "@type": "Offer",
      price: (game.price.final / 100).toFixed(2),
      priceCurrency: game.price.currency,
      availability: "https://schema.org/InStock",
      url: `https://store.steampowered.com/app/${appid}`,
    };
  }

  const updatedTimeIso = updatedAt;

  return (
    <>
      {/* 모바일 복귀 UX: 스크롤해도 닿는 고정 뒤로가기 바 (스마트 백) */}
      <DetailBackBar />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {game.headerImage && (
        // 스팀 CDN 외부 이미지 — 상세 페이지는 정적 프리렌더라 일반 img 사용
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.headerImage}
          alt={game.name}
          width={920}
          height={430}
          className="mb-4 w-full rounded-lg border border-neutral-800"
        />
      )}

      <h1 className="text-2xl font-bold text-neutral-100">
        {game.name} {t("detail.metaTitleSuffix")}
      </h1>
      <p className="mb-5 text-sm text-neutral-500">
        {t("modal.rank", { rank: game.rank })}
        {game.nameEn !== game.name && ` · ${game.nameEn}`}
        {detail.releaseDate &&
          ` · ${t("detail.released", { date: detail.releaseDate })}`}
      </p>

      {/* 현재 동접 (히어로) + 기간 변화 */}
      <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="text-xs text-neutral-500">{t("modal.players")}</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums text-neutral-50">
            {formatPlayersFull(game.players, locale)}
          </span>
          {game.changePct !== null && (
            <span
              className={`text-sm font-semibold ${
                game.changePct >= 0 ? "text-[#16c784]" : "text-[#ea3943]"
              }`}
            >
              {formatChangePct(game.changePct)}
            </span>
          )}
        </div>
      </div>

      {/* 핵심 데이터 (줄글 대신 수치로) */}
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("modal.peak24h")}
          value={formatPlayersFull(game.peak24h, locale)}
        />
        <Stat label={t("table.rank")} value={`#${game.rank}`} />
        <Stat
          label={t("common.marketShare")}
          value={formatSharePct(game.sharePct)}
        />
        <Stat
          label={t("modal.price")}
          value={
            game.isFree
              ? t("common.free")
              : priceDataStale || !game.price
                ? t("common.priceUnavailable")
                : formatPrice(game.price, locale)
          }
          badge={
            !priceDataStale && game.price && game.price.discountPct > 0
              ? `-${game.price.discountPct}%`
              : undefined
          }
        />
      </dl>

      {/* 평점 긍정률 바 — "이 게임 재밌나?" 신호 */}
      {game.reviewScore > 0 && positivePct !== null && (
        <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-200">
              {reviewLabel}
            </span>
            <span className="text-xs text-neutral-400">
              {t("detail.reviewsPositive", { pct: positivePct })} ·{" "}
              {t("modal.totalReviews", { count: game.totalReviews })}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#ea3943]/50">
            <div
              className="h-full rounded-full bg-[#16c784]"
              style={{ width: `${positivePct}%` }}
            />
          </div>
        </div>
      )}

      {/* 게임 소개 (Steam short_description; 미수집 시 SEO 폴백 문장) */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-neutral-200">
          {t("detail.introHeading")}
        </h2>
        <p className="leading-relaxed text-neutral-300">{introText}</p>
        {genreLabels.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
            <span className="text-neutral-500">{t("detail.genresLabel")}:</span>
            {genreLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs"
              >
                {label}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* 동접 추이 */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-neutral-200">
          {t("detail.trendHeading")}
        </h2>
        {trend.length >= 2 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <TrendChart points={trend} />
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{t("detail.trendEmpty")}</p>
        )}
      </section>

      <p className="mb-6 text-xs text-neutral-600">
        {t("detail.updatedNote", {
          time: new Date(updatedTimeIso).toISOString().slice(0, 10),
        })}
      </p>

      <div className="mb-8 flex flex-wrap gap-3 text-sm">
        <a
          href={`https://store.steampowered.com/app/${appid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500"
        >
          Steam ↗
        </a>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
        >
          ← {t("detail.backHome")}
        </Link>
      </div>

      <footer className="border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        <Link href="/about" className="hover:text-neutral-400">
          {t("nav.about")}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-neutral-400">
          {t("nav.privacy")}
        </Link>
      </footer>
      </main>
    </>
  );
}
