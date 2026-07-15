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
import { getBubbleSnapshot, getGenreOptions, getTrend } from "@/lib/data";
import type { Currency, GameBubbleData, TrendPoint } from "@/lib/types";
import { formatPlayersFull, formatPrice } from "@/lib/format";
import { buildAlternates, getSiteUrl } from "@/lib/site";

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

const loadSnapshot = cache((locale: Locale, currency: Currency) =>
  getBubbleSnapshot({ period: "24h", currency, locale }),
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

export default async function GameDetailPage({ params }: Props) {
  const { locale: rawLocale, appid: rawAppid } = await params;
  setRequestLocale(rawLocale);
  const locale = toLocale(rawLocale);
  const appid = parseAppid(rawAppid);
  if (appid === null) notFound();

  const t = await getTranslations({ locale });
  const [{ game, priceDataStale, updatedAt }, genreOptions, trend] =
    await Promise.all([
      loadGame(locale, appid),
      getGenreOptions(locale),
      getTrend(appid, 30),
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

  const summary = [
    t("detail.sPlayers", { name: game.name, players: game.players }),
    t("detail.sPeak", { peak: game.peak24h }),
    game.reviewScore > 0
      ? t("detail.sReview", { label: reviewLabel, count: game.totalReviews })
      : t("detail.sReviewNone"),
    priceSentence,
    t("detail.sRank", { rank: game.rank }),
  ].join(" ");

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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 브레드크럼 */}
      <nav className="mb-4 text-sm text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          {t("detail.home")}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-400">{game.name}</span>
      </nav>

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
      <p className="mb-6 text-sm text-neutral-500">
        {t("modal.rank", { rank: game.rank })}
        {game.nameEn !== game.name && ` · ${game.nameEn}`}
      </p>

      {/* 지표 */}
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
          <dt className="text-xs text-neutral-500">{t("modal.reviews")}</dt>
          <dd className="text-sm font-semibold text-neutral-100">
            {reviewLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{t("modal.price")}</dt>
          <dd className="text-sm font-semibold text-neutral-100">
            {game.isFree
              ? t("common.free")
              : priceDataStale || !game.price
                ? t("common.priceUnavailable")
                : formatPrice(game.price, locale)}
          </dd>
        </div>
      </dl>

      {/* 자연문 요약 (SEO 본문 + 애드센스 승인용 텍스트) */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-neutral-200">
          {t("detail.aboutHeading")}
        </h2>
        <p className="leading-relaxed text-neutral-300">{summary}</p>
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
  );
}
