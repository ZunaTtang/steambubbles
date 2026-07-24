import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { and, asc, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { sendAlert } from "@/lib/alerts";
import { collectAppDetails } from "@/lib/collect";
import { isMockMode } from "@/lib/data";
import { CircuitOpenError, sleep } from "@/lib/fetch-util";
import { recordJobRun } from "@/lib/jobs";

// 가격+메타+평점 수집 (CLAUDE.md 3-3/3-4).
// store 도메인은 비공식 상한(~200콜/5분/IP) — 모든 store 호출 사이 1.6초 간격 필수.
// 앱 1개 = store 3콜 ≈ 4.8s(+DB). Hobby 10s 한도에 맞춰 기본 배치 1개,
// 잔여분은 QStash 체이닝(다음 배치 자가 큐잉)으로 이어간다 (CLAUDE.md 4-1).
// Pro(maxDuration 60s) 전환 시 body.batchSize로 배치를 키울 수 있다.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Pro에서 상향 적용, Hobby에서는 플랫폼 상한으로 제한

const STORE_CALL_GAP_MS = 1_600; // ≈187콜/5분 — 상한 바로 아래
const DEFAULT_BATCH_SIZE = 1;
// 티어별 갱신 주기(CLAUDE.md 3-3: Tier 1 일 1회 / Tier 2 격일)는 스케줄별 tiers 필터로 구현
const DEFAULT_TIERS = [1, 2, 3];

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

  // cursor = 직전 배치에서 마지막으로 처리한 appid (keyset 페이지네이션 — 0이면 처음부터).
  // OFFSET을 쓰지 않는 이유: players-tier1이 10분마다 tier/last_seen_rank를 갱신해
  // 정렬이 흔들리면 OFFSET은 앱을 건너뛰거나 중복 처리한다. appid는 불변이라 안전하다.
  let cursor = 0;
  let batchSize = DEFAULT_BATCH_SIZE;
  let tiers = DEFAULT_TIERS;
  try {
    const body = (await req.json()) as {
      cursor?: unknown;
      batchSize?: unknown;
      tiers?: unknown;
    };
    if (
      typeof body.cursor === "number" &&
      Number.isInteger(body.cursor) &&
      body.cursor >= 0
    ) {
      cursor = body.cursor;
    }
    if (
      typeof body.batchSize === "number" &&
      Number.isInteger(body.batchSize) &&
      body.batchSize >= 1
    ) {
      batchSize = body.batchSize;
    }
    if (
      Array.isArray(body.tiers) &&
      body.tiers.every((t) => t === 1 || t === 2 || t === 3) &&
      body.tiers.length > 0
    ) {
      tiers = body.tiers as number[];
    }
  } catch {
    // 본문 없음/비JSON — 기본값 사용
  }

  try {
    const db = getDb();

    // keyset: appid > cursor 인 앱을 appid 오름차순으로 (동시 rank 갱신에 영향받지 않음)
    const batch = await db
      .select({ appid: apps.appid })
      .from(apps)
      .where(and(gt(apps.appid, cursor), inArray(apps.tier, tiers)))
      .orderBy(asc(apps.appid))
      .limit(batchSize);

    let processed = 0;
    let circuitOpen = false;

    for (let i = 0; i < batch.length; i++) {
      const { appid } = batch[i];
      // store 콜 간 1.6초 간격 — 체인 경계(cursor>0)에서도 첫 앱 앞에 유지 (QStash 지연은 보장 없음)
      if (i > 0 || cursor > 0) await sleep(STORE_CALL_GAP_MS);
      try {
        // 앱별 수집(kr/us appdetails + 가격 + 장르 + 평점)은 collect.ts 공용 로직 —
        // store 콜 사이 1.6초 스로틀 (온디맨드 /api/refresh와 동일 함수 공유)
        await collectAppDetails(db, appid, STORE_CALL_GAP_MS);
        processed += 1;
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          // store 도메인 서킷 오픈 — 체인 중단, 다음 스케줄 주기에 재개
          circuitOpen = true;
          console.error(`details 중단 (서킷 오픈): appid=${appid}`);
          break;
        }
        // details null/일시 오류 → 해당 앱 스킵 (CLAUDE.md 3-3)
        console.error(`details 스킵 appid=${appid}:`, err);
      }
    }

    // keyset 커서 = 이번 배치 마지막 appid. 꽉 찬 배치면 뒤에 더 있을 수 있다.
    const nextCursor = batch.length > 0 ? batch[batch.length - 1].appid : cursor;
    const hasMore = batch.length === batchSize;

    // QStash 체이닝 — 잔여분이 있으면 다음 배치를 자가 큐잉 (CLAUDE.md 4-1).
    // publish 실패(예: 무료 티어 일일 메시지 한도 소진)는 체인을 조용히 끊으므로 알림 필수.
    let chained = false;
    if (!circuitOpen && hasMore && process.env.QSTASH_TOKEN) {
      const origin = process.env.SITE_URL ?? req.nextUrl.origin;
      try {
        // baseUrl에 지역 엔드포인트(QSTASH_URL, 예: us-east-1) 지정 — 미지정 시 SDK 기본은
        // 글로벌 주소라 지역 계정에서 publish가 실패할 수 있다 (실측 확인)
        const qstash = new Client({
          token: process.env.QSTASH_TOKEN,
          baseUrl: process.env.QSTASH_URL,
        });
        await qstash.publishJSON({
          url: `${origin}/api/cron/details`,
          headers: { Authorization: `Bearer ${secret}` },
          body: { cursor: nextCursor, batchSize, tiers },
        });
        chained = true;
      } catch (err) {
        console.error("details 체인 publish 실패:", err);
        await sendAlert(
          `details 크론 체인 중단: QStash publish 실패 (cursor=${nextCursor}) — 수집이 여기서 멈춤`,
        );
      }
    }

    await recordJobRun("details", circuitOpen ? "error" : "ok", processed);
    return NextResponse.json({
      ok: !circuitOpen,
      processed,
      cursor: nextCursor,
      hasMore,
      chained,
    });
  } catch (err) {
    // 오류 메시지에 STEAM_API_KEY 등이 섞일 수 있으므로 내부 로그만 상세, 응답은 일반화
    console.error("details 실패:", err);
    await recordJobRun("details", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
