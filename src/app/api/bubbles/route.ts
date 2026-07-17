import { hasLocale } from "next-intl";
import { ALL_LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { getBubbleSnapshot } from "@/lib/data";
import { PERIODS, type Currency, type Period } from "@/lib/types";

// 클라이언트 기간/통화 전환용 스냅샷 API — CDN 5분 캐시
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

function isPeriod(v: string | null): v is Period {
  return v !== null && (PERIODS as readonly string[]).includes(v);
}

function isCurrency(v: string | null): v is Currency {
  return v === "KRW" || v === "USD";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const currency = searchParams.get("currency");
  const rawLocale = searchParams.get("locale");

  if (!isPeriod(period)) {
    return Response.json({ error: "invalid period" }, { status: 400 });
  }
  if (!isCurrency(currency)) {
    return Response.json({ error: "invalid currency" }, { status: 400 });
  }
  const locale: Locale = hasLocale(ALL_LOCALES, rawLocale)
    ? rawLocale
    : DEFAULT_LOCALE;
  // deep = 3,000위(Tier 3 포함) — 딥 밴드/뽑기에서 클라이언트가 lazy 로드
  const scope = searchParams.get("scope") === "deep" ? "deep" : "top";

  const snapshot = await getBubbleSnapshot({ period, currency, locale, scope });
  return Response.json(snapshot, { headers: CACHE_HEADERS });
}
