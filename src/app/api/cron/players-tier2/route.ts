import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, jobRuns, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";
import { getCurrentPlayersBulk } from "@/lib/steam";

// Tier 2 동접 폴링 (CLAUDE.md 3-2) — QStash가 30분 주기로 호출.
// tier=2 앱을 appid keyset으로 배치 조회(GetNumberOfCurrentPlayers, api 도메인은 빠름 →
// 큰 배치를 동시성으로 처리). 잔여분은 QStash 체이닝으로 이어간다.
// 마지막 배치에서 Tier 3(3시간 주기)의 신선도를 검사해 셀프 킥오프 — 전용 스케줄 불요.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 400; // api 콜은 스로틀 없음 — 동시성 15로 ~7초 내 처리
// Tier 3 킥오프 간격 — 30분 그리드에 얹히므로 5분 여유를 빼 3h 주기가 3.5h로 밀리지 않게
const TIER3_INTERVAL_MS = 3 * 3_600_000 - 5 * 60_000;

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
      .where(and(eq(apps.tier, 2), gt(apps.appid, cursor)))
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
          url: `${origin}/api/cron/players-tier2`,
          headers: { Authorization: `Bearer ${secret}` },
          body: { cursor: nextCursor, batchSize },
        });
        chained = true;
      } catch (err) {
        console.error("players-tier2 체인 publish 실패:", err);
      }
    }

    // Tier 3 셀프 킥오프 (CLAUDE.md 3-2, 2026-07 오픈) — 마지막 배치에서만 검사.
    // 마지막 성공이 3h 전이면 players-tier3 시작 메시지 발행. 전용 QStash 스케줄이
    // 이미 돌고 있다면 신선도 검사에 항상 걸려 여기서는 발화하지 않는다 (중복 안전).
    let tier3Kicked = false;
    if (!hasMore && process.env.QSTASH_TOKEN) {
      try {
        const last = await db
          .select({ latest: max(jobRuns.ts) })
          .from(jobRuns)
          .where(and(eq(jobRuns.job, "players-tier3"), eq(jobRuns.status, "ok")));
        const latestTs = last[0]?.latest ? new Date(last[0].latest).getTime() : 0;
        if (Date.now() - latestTs > TIER3_INTERVAL_MS) {
          const origin = process.env.SITE_URL ?? req.nextUrl.origin;
          const qstash = new Client({
            token: process.env.QSTASH_TOKEN,
            baseUrl: process.env.QSTASH_URL,
          });
          await qstash.publishJSON({
            url: `${origin}/api/cron/players-tier3`,
            headers: { Authorization: `Bearer ${secret}` },
            body: {},
          });
          tier3Kicked = true;
        }
      } catch (err) {
        console.error("players-tier3 킥오프 실패:", err);
      }
    }

    await recordJobRun("players-tier2", "ok", snapshotRows);
    return NextResponse.json({
      ok: true,
      snapshots: snapshotRows,
      cursor: nextCursor,
      hasMore,
      chained,
      tier3Kicked,
    });
  } catch (err) {
    console.error("players-tier2 실패:", err);
    await recordJobRun("players-tier2", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
