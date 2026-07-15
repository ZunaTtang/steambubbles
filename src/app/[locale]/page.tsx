import type { Metadata } from "next";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import {
  ALL_LOCALES,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import { getBubbleSnapshot, getGenreOptions } from "@/lib/data";
import { buildAlternates } from "@/lib/site";
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
  return { alternates: buildAlternates("", locale) };
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
