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
      siteName: t("site.title"),
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

  const [snapshot, genres] = await Promise.all([
    getBubbleSnapshot({ period: "24h", currency, locale }),
    getGenreOptions(locale),
  ]);

  return (
    <BubbleApp
      initialSnapshot={snapshot}
      genres={genres}
      initialCurrency={currency}
    />
  );
}
