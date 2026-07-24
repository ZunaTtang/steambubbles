import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appGenres, apps, genres, prices, reviews } from "@/db/schema";
import { sleep } from "./fetch-util";
import {
  getAppDetails,
  getAppReviewSummary,
  type AppPriceOverview,
  type StoreCC,
} from "./steam";

// store 도메인 수집 공용 로직 (CLAUDE.md 3-3/3-4) — details 크론(대량 순회)과
// /api/refresh 온디맨드(단건)가 공유한다. 한 앱당 store 3콜(kr·us appdetails + reviews).

type Db = ReturnType<typeof getDb>;

async function upsertPrice(
  db: Db,
  appid: number,
  cc: StoreCC,
  po: AppPriceOverview,
): Promise<void> {
  const now = new Date();
  await db
    .insert(prices)
    .values({
      appid,
      cc,
      currency: po.currency,
      price: po.final,
      priceInitial: po.initial,
      discountPercent: po.discountPercent,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [prices.appid, prices.cc],
      set: {
        currency: po.currency,
        price: po.final,
        priceInitial: po.initial,
        discountPercent: po.discountPercent,
        // $onUpdate는 upsert set 절에 미적용 — stale 판정이 이 컬럼에 의존 (schema.ts)
        updatedAt: now,
      },
    });
}

// 한 앱의 store 메타(가격·이름·소개·출시일·장르) + 평점 수집.
// gapMs = store 콜 사이 스로틀(지속 실행 크론=1.6초 / 온디맨드 단건=0).
// CircuitOpenError는 그대로 던진다 — 호출측이 중단(크론) 또는 스킵(온디맨드) 처리.
export async function collectAppDetails(
  db: Db,
  appid: number,
  gapMs = 0,
): Promise<void> {
  // cc=kr → KRW 가격 + 한국어 게임명·소개 (호출 1번이 통화+언어 동시 해결)
  const kr = await getAppDetails(appid, "kr");
  if (kr) {
    await db
      .update(apps)
      .set({
        nameKo: kr.name,
        headerImage: kr.headerImage,
        isFree: kr.isFree,
        descKo: kr.description,
      })
      .where(eq(apps.appid, appid));
    if (kr.priceOverview) await upsertPrice(db, appid, "kr", kr.priceOverview);
    if (kr.genreIds.length > 0) {
      await db
        .insert(genres)
        .values(kr.genreIds.map((id) => ({ id })))
        .onConflictDoNothing();
      await db
        .insert(appGenres)
        .values(kr.genreIds.map((genreId) => ({ appid, genreId })))
        .onConflictDoNothing();
    }
  }

  if (gapMs) await sleep(gapMs);
  // 출시일은 로케일 무관 — 영어 호출값을 정본으로 저장 (표시 라벨만 i18n)
  const us = await getAppDetails(appid, "us");
  if (us) {
    await db
      .update(apps)
      .set({
        nameEn: us.name,
        descEn: us.description,
        releaseDate: us.releaseDate,
      })
      .where(eq(apps.appid, appid));
    if (us.priceOverview) await upsertPrice(db, appid, "us", us.priceOverview);
  }

  if (gapMs) await sleep(gapMs);
  const review = await getAppReviewSummary(appid);
  if (review) {
    const now = new Date();
    await db
      .insert(reviews)
      .values({
        appid,
        reviewScore: review.reviewScore,
        totalPositive: review.totalPositive,
        totalNegative: review.totalNegative,
        totalReviews: review.totalReviews,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: reviews.appid,
        set: {
          reviewScore: review.reviewScore,
          totalPositive: review.totalPositive,
          totalNegative: review.totalNegative,
          totalReviews: review.totalReviews,
          updatedAt: now,
        },
      });
  }
}
