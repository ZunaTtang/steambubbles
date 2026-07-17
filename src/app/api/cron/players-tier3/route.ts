import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";
import { getCurrentPlayersBulk } from "@/lib/steam";

// Tier 3 동접 폴링 (CLAUDE.md 3-2, 2026-07 오픈) — QStash가 3시간 주기로 호출.
// players-tier2와 동일한 keyset 배치 + 체이닝 구조, 대상만 tier=3 (rank 1,001~3,000).
// 2,000앱 × 일 8회 = 16,000콜/일. 스냅샷 recency 창(4h) 안에 항상 들어오는 주기다.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 400; // api 콜은 스로틀 없음 — 동시성 15로 ~7초 내 처리

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isMockMode()) {
    return NextResponse.json(
      { error: "mock mode — DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  let cursor = 0; // 직전 배치 마지막 appid (keyset)
  let batchSize = DEFAULT_BATCH_SIZE;
  try {
    const body = (await req.json()) as { cursor?: unknown; batchSize?: unknown };
    if (typeof body.cursor === "number" && Number.isInteger(body.cursor) && body.cursor >= 0) {
      cursor = body.cursor;
    }
    if (typeof body.batchSize === "number" && Number.isInteger(body.batchSize) && body.batchSize >= 1) {
      batchSize = body.batchSize;
    }
  } catch {
    // 본문 없음 — 기본값
  }

  try {
    const db = getDb();
    const batch = await db
      .select({ appid: apps.appid })
      .from(apps)
      .where(and(eq(apps.tier, 3), gt(apps.appid, cursor)))
      .orderBy(asc(apps.appid))
      .limit(batchSize);

    let snapshotRows = 0;
    if (batch.length > 0) {
      const appids = batch.map((r) => r.appid);
      const playersByApp = await getCurrentPlayersBulk(appids, 15);
      const ts = new Date();
      const values = appids
        .filter((appid) => playersByApp.has(appid))
        .map((appid) => ({ appid, ts, players: playersByApp.get(appid)! }));
      if (values.length > 0) {
        await db.insert(playerSnapshots).values(values).onConflictDoNothing();
      }
      snapshotRows = values.length;
    }

    const nextCursor = batch.length > 0 ? batch[batch.length - 1].appid : cursor;
    const hasMore = batch.length === batchSize;

    let chained = false;
    if (hasMore && process.env.QSTASH_TOKEN) {
      const origin = process.env.SITE_URL ?? req.nextUrl.origin;
      try {
        const qstash = new Client({
          token: process.env.QSTASH_TOKEN,
          baseUrl: process.env.QSTASH_URL,
        });
        await qstash.publishJSON({
          url: `${origin}/api/cron/players-tier3`,
          headers: { Authorization: `Bearer ${secret}` },
          body: { cursor: nextCursor, batchSize },
        });
        chained = true;
      } catch (err) {
        console.error("players-tier3 체인 publish 실패:", err);
      }
    }

    await recordJobRun("players-tier3", "ok", snapshotRows);
    return NextResponse.json({
      ok: true,
      snapshots: snapshotRows,
      cursor: nextCursor,
      hasMore,
      chained,
    });
  } catch (err) {
    console.error("players-tier3 실패:", err);
    await recordJobRun("players-tier3", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
