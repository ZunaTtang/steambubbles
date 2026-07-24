import type { Metadata } from "next";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ALL_LOCALES,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import { getBubbleSnapshot, getGenreOptions } from "@/lib/data";
import { buildAlternates, getSiteUrl } from "@/lib/site";
import type { Currency } from "@/lib/types";
import BubbleApp from "@/components/app/BubbleApp";

type Props = {
  params: Promise<{ locale: string }>;
};

// 통화는 SSR이 쿠키에서 읽는다 (CLAUDE.md 7) — 정적 프리렌더 금지
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = hasLocale(ALL_LOCALES, rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const t = await getTranslations({ locale });
  const alternates = buildAlternates("", locale);
  const ogUrl = `${getSiteUrl()}/${locale}/og`;
  return {
    alternates,
    openGraph: {
      title: t("site.title"),
      description: t("site.description"),
      url: alternates.canonical,
      // 사이트명 = 브랜드(도메인·로고 워드마크와 일치) — Google이 "Vercel"로 추론하지 않게.
      // 페이지 제목(t("site.title"))은 별도로 로케일 설명형 유지
      siteName: "steambubbles",
      locale,
      type: "website",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("site.title"),
      description: t("site.description"),
      images: [ogUrl],
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale: Locale = hasLocale(ALL_LOCALES, rawLocale)
    ? rawLocale
    : DEFAULT_LOCALE;

  const cookieCurrency = (await cookies()).get(CURRENCY_COOKIE)?.value;
  const currency: Currency =
    cookieCurrency === "KRW" || cookieCurrency === "USD"
      ? cookieCurrency
      : DEFAULT_CURRENCY[locale];

  const t = await getTranslations({ locale });
  const [snapshot, genres] = await Promise.all([
    getBubbleSnapshot({ period: "24h", currency, locale }),
    getGenreOptions(locale),
  ]);

  // WebSite 구조화 데이터 — Google 검색의 "사이트 이름"을 브랜드로 고정(도메인 추론 "Vercel" 방지).
  // name=브랜드, alternateName=로케일 설명형(한국어 검색 대응)
  const siteUrl = getSiteUrl();
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "steambubbles",
    alternateName: t("site.title"),
    url: siteUrl,
    inLanguage: locale,
    description: t("site.description"),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <BubbleApp
        initialSnapshot={snapshot}
        genres={genres}
        initialCurrency={currency}
      />
    </>
  );
}
