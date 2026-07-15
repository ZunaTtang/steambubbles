import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";
import { getCurrentPlayersBulk, getMostPlayedGames } from "@/lib/steam";

// Tier 1 동접 수집 (CLAUDE.md 3-1) — QStash가 10분 주기로 호출.
// GetMostPlayedGames로 top 100 랭킹을 받고(현재 동접은 미포함, 실테스트 기록 steam.ts 참조),
// 각 appid의 현재 동접을 GetNumberOfCurrentPlayers로 조회해 스냅샷 적재 + 유니버스(apps) 편입.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 100개 앱 현재치 조회 여유 (Pro 상향, Hobby는 플랫폼 상한)

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

    let snapshotRows = 0;
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

      // 현재 동접은 앱별 조회 (GetMostPlayedGames에 없음). 조회 성공분만 스냅샷 적재.
      const playersByApp = await getCurrentPlayersBulk(ranks.map((r) => r.appid));
      const values = ranks
        .filter((r) => playersByApp.has(r.appid))
        .map((r) => ({ appid: r.appid, ts, players: playersByApp.get(r.appid)! }));
      snapshotRows = values.length;
      if (values.length > 0) {
        await db.insert(playerSnapshots).values(values).onConflictDoNothing();
      }
    }

    await recordJobRun("players-tier1", "ok", snapshotRows);
    return NextResponse.json({
      ok: true,
      apps: ranks.length,
      snapshots: snapshotRows,
      ts: ts.toISOString(),
    });
  } catch (err) {
    // 오류 메시지 URL에 STEAM_API_KEY가 섞일 수 있으므로 내부 로그만 상세, 응답은 일반화
    console.error("players-tier1 실패:", err);
    await recordJobRun("players-tier1", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
