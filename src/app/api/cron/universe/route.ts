import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { isMockMode } from "@/lib/data";
import { sleep } from "@/lib/fetch-util";
import { recordJobRun } from "@/lib/jobs";
import { getAppDetails, getSteamSpyAllPage } from "@/lib/steam";
import type { SteamSpyEntry } from "@/lib/steam";

// 폴링 유니버스 구축 (CLAUDE.md 3-2) — QStash가 일 1회 호출.
// SteamSpy top 페이지들(소유자 순, 페이지당 1,000)을 ccu(현재 동접) 순으로 정렬해
// 상위 ~900개를 Tier 2, 그다음 ~2,000개를 Tier 3(1,001~3,000위, 2026-07 오픈)로 편입한다.
// tier 1은 players-tier1 소관이므로 절대 강등하지 않는다(CASE 가드).
// SteamSpy가 이름도 주므로 name_en·헤더 이미지를 함께 시드 → details 크론 없이도
// 상세 페이지가 실제 이름으로 SEO 가치를 갖는다(기존 값은 coalesce로 보존).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIER2_TARGET = 900; // rank 101~1,000 (CLAUDE.md 3-2)
const TIER3_TARGET = 2000; // rank 1,001~3,000 — 버블맵 딥 랭크 최대치의 근거
const STEAMSPY_PAGES = 3; // 소유자 순 top 3,000 (1req/sec 제한 준수)
// 뒷 페이지 부분 실패로 후보가 쪼그라든 날에 멀쩡한 tier 3를 휴면 강등하지 않기 위한 가드
const TIER3_DEMOTE_MIN = 1500;

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
    // 소유자 순 top 3,000 (3req, 1req/sec 준수) → ccu 내림차순 정렬.
    // 뒷 페이지 실패는 있는 만큼만 사용 (tier 3 강등은 TIER3_DEMOTE_MIN 가드가 보호)
    const byApp = new Map<number, SteamSpyEntry>();
    for (let page = 0; page < STEAMSPY_PAGES; page++) {
      if (page > 0) await sleep(1100);
      const entries = await getSteamSpyAllPage(page);
      if (entries.length === 0) {
        if (page === 0) {
          // 첫 페이지 실패 = SteamSpy 불능 — 우아하게 강등, 다음 주기에 재시도
          await recordJobRun("universe", "error", 0);
          return NextResponse.json({ ok: false, reason: "steamspy unavailable" });
        }
        break;
      }
      for (const e of entries) {
        if (e.appid > 0 && !byApp.has(e.appid)) byApp.set(e.appid, e);
      }
    }

    const ranked = [...byApp.values()].sort((a, b) => b.ccu - a.ccu);
    const tier2Candidates = ranked.slice(0, TIER2_TARGET);
    const tier3Candidates = ranked.slice(
      TIER2_TARGET,
      TIER2_TARGET + TIER3_TARGET,
    );

    const now = new Date();
    const db = getDb();
    // 배치 upsert — tier 1은 CASE로 보존(현재 top100을 강등하지 않음), 나머지/신규는 tier 2
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < tier2Candidates.length; i += CHUNK) {
      const chunk = tier2Candidates.slice(i, i + CHUNK);
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

    // Tier 3 (1,001~3,000위) — tier 1·2는 보존하고 그 외/신규만 3으로
    let tier3Upserted = 0;
    for (let i = 0; i < tier3Candidates.length; i += CHUNK) {
      const chunk = tier3Candidates.slice(i, i + CHUNK);
      await db
        .insert(apps)
        .values(
          chunk.map((e) => ({
            appid: e.appid,
            tier: 3,
            nameEn: e.name || null,
            headerImage: headerUrl(e.appid),
          })),
        )
        .onConflictDoUpdate({
          target: apps.appid,
          set: {
            tier: sql`case when ${apps.tier} in (1, 2) then ${apps.tier} else 3 end`,
            nameEn: sql`coalesce(${apps.nameEn}, excluded.name_en)`,
            headerImage: sql`coalesce(${apps.headerImage}, excluded.header_image)`,
            updatedAt: now,
          },
        });
      tier3Upserted += chunk.length;
    }

    // 유니버스에서 탈락한 tier 3 → 휴면(4) 강등 — 폴링 대상 집합을 ~2,000으로 유지.
    // (기본값 tier=3으로 들어온 잔여 행도 여기서 정리된다)
    let demoted = 0;
    if (tier3Candidates.length >= TIER3_DEMOTE_MIN) {
      const keepIds = tier3Candidates.map((e) => e.appid);
      const demotedRows = await db
        .update(apps)
        .set({ tier: 4, updatedAt: now })
        .where(and(eq(apps.tier, 3), notInArray(apps.appid, keepIds)))
        .returning({ appid: apps.appid });
      demoted = demotedRows.length;
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

    await recordJobRun("universe", "ok", upserted + tier3Upserted);
    return NextResponse.json({
      ok: true,
      fetched: byApp.size,
      tier2: upserted,
      tier3: tier3Upserted,
      demoted,
      backfilled,
    });
  } catch (err) {
    console.error("universe 실패:", err);
    await recordJobRun("universe", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
