import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, count, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRuns, prices } from "@/db/schema";
import { sendAlert } from "@/lib/alerts";
import { isMockMode } from "@/lib/data";
import { recordJobRun } from "@/lib/jobs";

// 데드맨스위치 (CLAUDE.md 4-1) — 일 1회 호출, 수집 중단을 감지해 Discord 알림.
// 방치형 운영의 전제조건: 이 잡이 침묵하면 사이트가 조용히 죽는다.

export const dynamic = "force-dynamic";

const SNAPSHOT_MAX_AGE_MS = 60 * 60_000; // Tier 1 스냅샷 최근 1시간
const PRICE_MAX_AGE_MS = 3 * 24 * 60 * 60_000; // 가격 갱신 최근 3일

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isMockMode()) {
    return NextResponse.json({ mock: true, skipped: true });
  }

  try {
    const db = getDb();
    const now = Date.now();
    const checks: Check[] = [];

    // (1) players-tier1 잡이 최근 1시간 내 성공했는가.
    // job_runs를 기준점으로 삼는다 — player_snapshots.max(ts)를 쓰면 Phase 3에서 Tier 2
    // 폴러가 같은 테이블에 쓰기 시작하는 순간 죽은 Tier 1 잡이 신선한 Tier 2 행에 가려진다.
    const jobRows = await db
      .select({ latest: max(jobRuns.ts) })
      .from(jobRuns)
      .where(and(eq(jobRuns.job, "players-tier1"), eq(jobRuns.status, "ok")));
    const latestJob = jobRows[0]?.latest
      ? new Date(jobRows[0].latest).getTime()
      : null;
    if (latestJob === null) {
      checks.push({
        name: "tier1-job",
        ok: false,
        detail: "players-tier1 성공 기록 없음 — Tier 1 수집이 한 번도 성공하지 않음",
      });
    } else if (now - latestJob > SNAPSHOT_MAX_AGE_MS) {
      checks.push({
        name: "tier1-job",
        ok: false,
        detail: `마지막 성공 ${new Date(latestJob).toISOString()} — 60분 초과`,
      });
    } else {
      checks.push({ name: "tier1-job", ok: true, detail: "정상" });
    }

    // (2) prices 테이블이 비어있지 않다면 3일 내 갱신이 있는가
    const priceRows = await db
      .select({ cnt: count(), latest: max(prices.updatedAt) })
      .from(prices);
    const priceCount = priceRows[0]?.cnt ?? 0;
    if (priceCount === 0) {
      checks.push({
        name: "price-freshness",
        ok: true,
        detail: "prices 비어 있음 — 검사 스킵 (details 크론 최초 실행 전)",
      });
    } else {
      const latestPrice = priceRows[0]?.latest
        ? new Date(priceRows[0].latest).getTime()
        : null;
      if (latestPrice === null || now - latestPrice > PRICE_MAX_AGE_MS) {
        checks.push({
          name: "price-freshness",
          ok: false,
          detail: `마지막 가격 갱신 ${latestPrice ? new Date(latestPrice).toISOString() : "없음"} — 3일 초과 (우아한 강등 발동 상태)`,
        });
      } else {
        checks.push({ name: "price-freshness", ok: true, detail: "정상" });
      }
    }

    const violations = checks.filter((c) => !c.ok);
    for (const v of violations) {
      await sendAlert(`데드맨스위치 위반: ${v.name} — ${v.detail}`);
    }

    await recordJobRun(
      "healthcheck",
      violations.length > 0 ? "error" : "ok",
      violations.length,
    );
    return NextResponse.json({ checks });
  } catch (err) {
    console.error("healthcheck 실패:", err);
    await recordJobRun("healthcheck", "error", 0);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
