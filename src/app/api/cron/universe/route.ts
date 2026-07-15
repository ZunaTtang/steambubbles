import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { sleep } from "@/lib/fetch-util";
import { recordJobRun } from "@/lib/jobs";
import { getAppDetails, getSteamSpyAllPage } from "@/lib/steam";

// 폴링 유니버스 구축 (CLAUDE.md 3-2) — QStash가 일 1회 호출.
// SteamSpy top 페이지(소유자 순 상위 1000)를 ccu(현재 동접) 순으로 정렬해 상위 ~900개를
// Tier 2 후보로 편입한다. tier 1은 players-tier1 소관이므로 절대 강등하지 않는다(CASE 가드).
// SteamSpy가 이름도 주므로 name_en·헤더 이미지를 함께 시드 → details 크론 없이도 Tier 2
// 상세 페이지가 실제 이름으로 SEO 가치를 갖는다(기존 값은 coalesce로 보존).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIER2_TARGET = 900; // rank 101~1,000 (CLAUDE.md 3-2)

const headerUrl = (appid: number) =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;

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
    // 소유자 순 top 1000 (1req) → ccu 내림차순 정렬 후 상위 TIER2_TARGET
    const entries = await getSteamSpyAllPage(0);
    if (entries.length === 0) {
      // SteamSpy 실패는 우아하게 강등 — 유니버스는 다음 주기에 재시도
      await recordJobRun("universe", "error", 0);
      return NextResponse.json({ ok: false, reason: "steamspy unavailable" });
    }

    const candidates = entries
      .filter((e) => e.appid > 0)
      .sort((a, b) => b.ccu - a.ccu)
      .slice(0, TIER2_TARGET);

    const now = new Date();
    const db = getDb();
    // 배치 upsert — tier 1은 CASE로 보존(현재 top100을 강등하지 않음), 나머지/신규는 tier 2
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      await db
        .insert(apps)
        .values(
          chunk.map((e) => ({
            appid: e.appid,
            tier: 2,
            nameEn: e.name || null,
            headerImage: headerUrl(e.appid),
          })),
        )
        .onConflictDoUpdate({
          target: apps.appid,
          set: {
            tier: sql`case when ${apps.tier} = 1 then 1 else 2 end`,
            // 기존 값(details가 채운 것) 우선 — 없을 때만 SteamSpy 시드로 채움
            nameEn: sql`coalesce(${apps.nameEn}, excluded.name_en)`,
            headerImage: sql`coalesce(${apps.headerImage}, excluded.header_image)`,
            updatedAt: now,
          },
        });
      upserted += chunk.length;
    }

    // 이름 미수집(name_en null) 앱 백필 — store appdetails로 이름·헤더를 채워 버블맵 "#appid" 제거.
    // (details 크론이 채우기 전 top100 신규 진입 등). store 1.6초 스로틀 준수, 회당 20개로 캡.
    let backfilled = 0;
    const unnamed = await db
      .select({ appid: apps.appid })
      .from(apps)
      .where(isNull(apps.nameEn))
      .limit(20);
    for (let i = 0; i < unnamed.length; i++) {
      if (i > 0) await sleep(1600);
      try {
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
          backfilled += 1;
        }
      } catch {
        // 개별 실패 스킵 (다음 주기 재시도)
      }
    }

    await recordJobRun("universe", "ok", upserted);
    return NextResponse.json({
      ok: true,
      fetched: entries.length,
      tier2: upserted,
      backfilled,
    });
  } catch (err) {
    console.error("universe 실패:", err);
    await recordJobRun("universe", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
