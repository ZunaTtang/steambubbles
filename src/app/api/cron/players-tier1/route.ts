import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";
import { getMostPlayedGames } from "@/lib/steam";

// Tier 1 동접 수집 (CLAUDE.md 3-1) — QStash가 10분 주기로 호출.
// 호출 1번으로 top 100 스냅샷 적재 + 폴링 유니버스(apps) 자동 편입.

export const dynamic = "force-dynamic";

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
    const ranks = await getMostPlayedGames();
    const ts = new Date(); // 스냅샷 전체가 단일 ts를 공유

    if (ranks.length > 0) {
      const db = getDb();
      await db
        .insert(apps)
        .values(
          ranks.map((r) => ({
            appid: r.appid,
            tier: r.rank <= 100 ? 1 : 2,
            lastSeenRank: r.rank,
          })),
        )
        .onConflictDoUpdate({
          target: apps.appid,
          // 이름·이미지는 details 크론 소관 — 여기서 덮어쓰지 않는다
          set: {
            tier: sql`excluded.tier`,
            lastSeenRank: sql`excluded.last_seen_rank`,
            // $onUpdate는 upsert set 절에 미적용 — 명시 필수 (schema.ts 주석)
            updatedAt: ts,
          },
        });

      await db
        .insert(playerSnapshots)
        .values(ranks.map((r) => ({ appid: r.appid, ts, players: r.players })))
        .onConflictDoNothing();
    }

    await recordJobRun("players-tier1", "ok", ranks.length);
    return NextResponse.json({
      ok: true,
      rows: ranks.length,
      ts: ts.toISOString(),
    });
  } catch (err) {
    // 오류 메시지 URL에 STEAM_API_KEY가 섞일 수 있으므로 내부 로그만 상세, 응답은 일반화
    console.error("players-tier1 실패:", err);
    await recordJobRun("players-tier1", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
