import { getTrend } from "@/lib/data";

// 게임별 동접 추이 API (모달 스파크라인용) — CDN 5분 캐시
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 90;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid: rawAppid } = await params;
  // Postgres int4 상한(2,147,483,647) 초과·후행 문자 거부 — DB 모드에서 22003 예외로 인한 500 방지
  if (!/^\d{1,10}$/.test(rawAppid)) {
    return Response.json({ error: "invalid appid" }, { status: 400 });
  }
  const appid = Number(rawAppid);
  if (appid <= 0 || appid > 2_147_483_647) {
    return Response.json({ error: "invalid appid" }, { status: 400 });
  }

  const rawDays = new URL(request.url).searchParams.get("days");
  const parsedDays = rawDays === null ? DEFAULT_DAYS : Number.parseInt(rawDays, 10);
  const days = Number.isFinite(parsedDays)
    ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, parsedDays))
    : DEFAULT_DAYS;

  const trend = await getTrend(appid, days);
  return Response.json(trend, { headers: CACHE_HEADERS });
}
