import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, playerSnapshots } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { sleep } from "@/lib/fetch-util";
import { recordJobRun } from "@/lib/jobs";
import { getAppDetails, getGamesByConcurrentPlayers } from "@/lib/steam";

// Tier 1 동접 수집 (CLAUDE.md 3-1) — QStash가 10분 주기로 호출.
// GetGamesByConcurrentPlayers 1콜로 top 100의 현재 동접+랭킹을 받아 스냅샷 적재.
// tier=1은 항상 "현재 top 100"과 일치하도록: 이번 목록은 tier 1로 올리고,
// 이번 목록에 없는 기존 tier 1은 tier 2로 강등한다. Tier 2 폴링/유니버스는 별도 크론.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const games = await getGamesByConcurrentPlayers();
    const ts = new Date(); // 스냅샷 전체가 단일 ts를 공유

    let snapshotRows = 0;
    if (games.length > 0) {
      const db = getDb();
      const appids = games.map((g) => g.appid);

      // top 100을 tier 1로 (이름·이미지는 details 크론 소관 — 덮어쓰지 않음)
      await db
        .insert(apps)
        .values(
          games.map((g) => ({ appid: g.appid, tier: 1, lastSeenRank: g.rank })),
        )
        .onConflictDoUpdate({
          target: apps.appid,
          set: {
            tier: sql`1`,
            lastSeenRank: sql`excluded.last_seen_rank`,
            updatedAt: ts, // $onUpdate는 upsert set 절에 미적용 — 명시 필수
          },
        });

      // 이번 top 100에서 빠진 기존 tier 1은 tier 2로 강등 (tier1 = 현재 top100 유지)
      await db
        .update(apps)
        .set({ tier: 2, updatedAt: ts })
        .where(and(eq(apps.tier, 1), notInArray(apps.appid, appids)));

      // 현재 동접 스냅샷 (GetGamesByConcurrentPlayers가 이미 제공)
      const values = games.map((g) => ({
        appid: g.appid,
        ts,
        players: g.players,
      }));
      await db.insert(playerSnapshots).values(values).onConflictDoNothing();
      snapshotRows = values.length;

      // top100 중 이름 미수집 앱 즉시 백필 (신규 진입 → 버블맵 "#appid" 방지).
      // store 1.6초 스로틀, 회당 5개 캡. 실패해도 코어(스냅샷)에 영향 없게 try/catch.
      try {
        const unnamed = await db
          .select({ appid: apps.appid })
          .from(apps)
          .where(and(inArray(apps.appid, appids), isNull(apps.nameEn)))
          .limit(5);
        for (let i = 0; i < unnamed.length; i++) {
          if (i > 0) await sleep(1600);
          const d = await getAppDetails(unnamed[i].appid, "us");
          if (d?.name) {
            await db
              .update(apps)
              .set({
                nameEn: d.name,
                headerImage: sql`coalesce(${apps.headerImage}, ${d.headerImage})`,
                updatedAt: new Date(),
              })
              .where(eq(apps.appid, unnamed[i].appid));
          }
        }
      } catch (e) {
        console.error("tier1 이름 백필 스킵:", e);
      }
    }

    await recordJobRun("players-tier1", "ok", snapshotRows);
    return NextResponse.json({
      ok: true,
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
