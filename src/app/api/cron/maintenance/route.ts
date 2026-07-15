import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { count, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { playerDaily, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";

// 롤업 + 보존 (CLAUDE.md 4-1) — QStash가 일 1회 호출.
// player_snapshots를 UTC 일 단위로 집계해 player_daily(영구)에 upsert하고,
// 원본 스냅샷은 보존 기간(45일) 초과분을 정리한다.
// 참고: player_hourly(1년) 단계는 현재 생략 — 상세 추이/7·30일 기준점은 player_daily로 충분.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SNAPSHOT_RETENTION_DAYS = 45;

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

  try {
    const db = getDb();

    // 1) 일 단위 롤업 — 보존 중인 스냅샷을 (appid, UTC date)로 집계해 upsert (멱등)
    await db.execute(sql`
      insert into player_daily (appid, date, peak, avg)
      select appid, (ts at time zone 'UTC')::date as d,
             max(players), cast(round(avg(players)) as int)
      from player_snapshots
      group by appid, (ts at time zone 'UTC')::date
      on conflict (appid, date) do update
        set peak = excluded.peak, avg = excluded.avg
    `);

    // 2) 보존 정리 — 롤업 완료 후 오래된 원본 스냅샷 삭제
    await db.execute(sql`
      delete from player_snapshots
      where ts < now() - make_interval(days => ${SNAPSHOT_RETENTION_DAYS})
    `);

    const dailyRows = await db.select({ n: count() }).from(playerDaily);
    const snapRows = await db.select({ n: count() }).from(playerSnapshots);

    await recordJobRun("maintenance", "ok", dailyRows[0]?.n ?? 0);
    return NextResponse.json({
      ok: true,
      playerDaily: dailyRows[0]?.n ?? 0,
      playerSnapshots: snapRows[0]?.n ?? 0,
    });
  } catch (err) {
    console.error("maintenance 실패:", err);
    await recordJobRun("maintenance", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
