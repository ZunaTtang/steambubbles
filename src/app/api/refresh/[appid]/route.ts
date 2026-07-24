import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, prices, reviews } from "@/db/schema";
import { collectAppDetails } from "@/lib/collect";
import { isMockMode } from "@/lib/data";
import { CircuitOpenError } from "@/lib/fetch-util";
import { CC_BY_CURRENCY, type Currency } from "@/lib/types";

// 온디맨드 갱신 (CLAUDE.md 3-3) — 유저가 게임을 볼 때(모달/상세) 그 게임의 가격·평점·
// 소개를 store에서 즉시 갱신. 하위 순위 게임의 신선도를 "본 만큼" 끌어올린다.
// 남용/과금 방지 3중 게이트: ① 추적 대상(apps에 존재)만 ② 쿨다운(6h) 내면 store 콜 스킵
// ③ store 서킷브레이커(fetch-util)가 429/장애 시 차단. 유저 트리거·단건이라 CRON_SECRET 불요.

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 6 * 3_600_000; // 최근 6시간 내 갱신됐으면 store 콜 없이 스킵

function parseAppid(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 2_147_483_647 ? n : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appid: string }> },
) {
  const { appid: raw } = await params;
  const appid = parseAppid(raw);
  if (appid === null) {
    return NextResponse.json({ refreshed: false }, { status: 400 });
  }
  if (isMockMode()) return NextResponse.json({ refreshed: false });

  const currency: Currency =
    req.nextUrl.searchParams.get("currency") === "KRW" ? "KRW" : "USD";

  try {
    const db = getDb();
    // 추적 대상 확인 + 마지막 평점 갱신 시각(쿨다운 근거). 없으면 임의 appid → 거부
    const [existing] = await db
      .select({ appid: apps.appid, reviewedAt: reviews.updatedAt })
      .from(apps)
      .leftJoin(reviews, eq(reviews.appid, apps.appid))
      .where(eq(apps.appid, appid))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ refreshed: false }, { status: 404 });
    }
    const fresh =
      existing.reviewedAt !== null &&
      Date.now() - new Date(existing.reviewedAt).getTime() < COOLDOWN_MS;
    if (fresh) return NextResponse.json({ refreshed: false });

    // 단건 — 스로틀 없이 즉시 수집 (서킷브레이커가 store 장애 보호)
    await collectAppDetails(db, appid, 0);

    // 갱신 후 현재 통화 가격 + 평점 + isFree를 읽어 반환 (모달 라이브 갱신용)
    const cc = CC_BY_CURRENCY[currency];
    const [row] = await db
      .select({
        isFree: apps.isFree,
        price: prices.price,
        priceInitial: prices.priceInitial,
        discountPercent: prices.discountPercent,
        reviewScore: reviews.reviewScore,
        totalReviews: reviews.totalReviews,
      })
      .from(apps)
      .leftJoin(prices, and(eq(prices.appid, apps.appid), eq(prices.cc, cc)))
      .leftJoin(reviews, eq(reviews.appid, apps.appid))
      .where(eq(apps.appid, appid))
      .limit(1);

    const isFree = row?.isFree ?? false;
    return NextResponse.json({
      refreshed: true,
      isFree,
      price:
        isFree || row?.price == null
          ? null
          : {
              currency,
              initial: row.priceInitial ?? row.price,
              final: row.price,
              discountPct: row.discountPercent ?? 0,
            },
      reviewScore: row?.reviewScore ?? 0,
      totalReviews: row?.totalReviews ?? 0,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ refreshed: false });
    }
    console.error(`refresh 실패 appid=${appid}:`, err);
    return NextResponse.json({ refreshed: false }, { status: 500 });
  }
}
