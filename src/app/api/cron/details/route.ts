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
// 후보 조회 상한 — 실제 처리량은 TIME_BUDGET_MS가 제한한다(아래). 과거의 batchSize=1은
// 앱마다 QStash 체인 메시지 1건을 발행해 ~3,000앱 스윕이 QStash 무료 한도를 폭파했다.
const DEFAULT_BATCH_SIZE = 20;
// 한 invocation의 처리 시간 예산 — 함수 상한(Hobby 10s / Pro 60s) 아래로 잡아 체인 publish·
// 응답 여유를 남긴다. 기본 4초 = Hobby에서 앱 1개/홉이 안전(앱 1개 ≈ 4.8초). Pro 전환 시
// 환경변수로 상향하면 홉당 처리량이 늘어 체인 메시지 수가 줄어든다(예: 45000 → ~9개/홉).
const TIME_BUDGET_MS = Number(process.env.DETAILS_TIME_BUDGET_MS ?? 4_000);
// 한 스윕(체인 전체)이 처리할 앱 총량 상한 — details가 QStash 무료 일일 한도(≈500건)를 혼자
// 소진해 tier1/tier2(라이브 동접 = 핵심 데이터)를 굶기는 것을 막는다. 환경변수로 조정.
const MAX_APPS_PER_SWEEP = Number(process.env.DETAILS_MAX_APPS_PER_SWEEP ?? 100);
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
  // OFFSET을 쓰지 않는 이유: players-tier1이 30분마다 tier/last_seen_rank를 갱신해
  // 정렬이 흔들리면 OFFSET은 앱을 건너뛰거나 중복 처리한다. appid는 불변이라 안전하다.
  let cursor = 0;
  let batchSize = DEFAULT_BATCH_SIZE;
  let tiers = DEFAULT_TIERS;
  // budget = 이 스윕에서 아직 처리 가능한 앱 수(체인 홉마다 차감). 첫 홉은 MAX_APPS_PER_SWEEP.
  let budget = MAX_APPS_PER_SWEEP;
  try {
    const body = (await req.json()) as {
      cursor?: unknown;
      batchSize?: unknown;
      tiers?: unknown;
      budget?: unknown;
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
    if (
      typeof body.budget === "number" &&
      Number.isInteger(body.budget) &&
      body.budget >= 1
    ) {
      budget = body.budget;
    }
  } catch {
    // 본문 없음/비JSON — 기본값 사용
  }

  try {
    const db = getDb();

    // keyset: appid > cursor 인 앱을 appid 오름차순으로 (동시 rank 갱신에 영향받지 않음).
    // 후보는 batchSize·잔여 budget 중 작은 만큼만 조회한다.
    const limit = Math.min(batchSize, budget);
    const batch = await db
      .select({ appid: apps.appid })
      .from(apps)
      .where(and(gt(apps.appid, cursor), inArray(apps.tier, tiers)))
      .orderBy(asc(apps.appid))
      .limit(limit);

    // 시간 예산 안에서 소화할 수 있는 만큼만 처리하고 나머지는 다음 체인 홉으로 넘긴다.
    // Pro(큰 예산)에선 한 홉이 여러 앱을 처리해 "앱 1개=메시지 1건" 폭주를 줄이고,
    // MAX_APPS_PER_SWEEP가 스윕 전체 메시지 수를 상한한다(Hobby 포함) — QStash 무료 보호.
    const start = Date.now();
    let processed = 0;
    let advanced = 0; // 커서를 전진시킨(처리+스킵) 앱 수 — budget 차감·잔여 판정 기준
    let circuitOpen = false;
    let timeExhausted = false;
    let nextCursor = cursor;

    for (let i = 0; i < batch.length; i++) {
      // 다음 앱을 처리하면 함수 상한을 넘길 위험 → 중단, 남은 앱은 다음 홉으로 (체인 보존)
      if (Date.now() - start > TIME_BUDGET_MS) {
        timeExhausted = true;
        break;
      }
      const { appid } = batch[i];
      // store 콜 간 1.6초 간격 — 체인 경계(cursor>0)에서도 첫 앱 앞에 유지 (QStash 지연은 보장 없음)
      if (i > 0 || cursor > 0) await sleep(STORE_CALL_GAP_MS);
      try {
        // 앱별 수집(kr/us appdetails + 가격 + 장르 + 평점)은 collect.ts 공용 로직 —
        // store 콜 사이 1.6초 스로틀 (온디맨드 /api/refresh와 동일 함수 공유)
        await collectAppDetails(db, appid, STORE_CALL_GAP_MS);
        processed += 1;
        nextCursor = appid;
        advanced += 1;
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          // store 도메인 서킷 오픈 — 체인 중단, 다음 스케줄 주기에 재개 (커서 전진 안 함)
          circuitOpen = true;
          console.error(`details 중단 (서킷 오픈): appid=${appid}`);
          break;
        }
        // details null/일시 오류 → 해당 앱 스킵하되 커서는 전진 (무한 재시도 방지, CLAUDE.md 3-3)
        console.error(`details 스킵 appid=${appid}:`, err);
        nextCursor = appid;
        advanced += 1;
      }
    }

    const remainingBudget = budget - advanced;
    // 더 처리할 앱이 있나: 시간 예산으로 끊겼으면 이 배치에 남아 있고, 배치를 꽉 채웠으면
    // DB에 더 있을 수 있다. 서킷 오픈·스윕 예산 소진이면 체인하지 않는다.
    const moreExists = timeExhausted || batch.length === limit;
    const hasMore = !circuitOpen && moreExists && remainingBudget > 0;

    // QStash 체이닝 — 잔여분이 있으면 다음 배치를 자가 큐잉 (CLAUDE.md 4-1).
    // publish 실패(예: 무료 티어 일일 메시지 한도 소진)는 체인을 조용히 끊으므로 알림 필수.
    let chained = false;
    if (hasMore && process.env.QSTASH_TOKEN) {
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
          body: { cursor: nextCursor, batchSize, tiers, budget: remainingBudget },
        });
        chained = true;
      } catch (err) {
        console.error("details 체인 publish 실패:", err);
        await sendAlert(
          `details 크론 체인 중단: QStash publish 실패 (cursor=${nextCursor}) — 수집이 여기서 멈춤`,
        );
      }
    } else if (!circuitOpen && moreExists && remainingBudget <= 0) {
      // 스윕 앱 상한 도달 — 의도된 스로틀(장애 아님). 다음 스케줄 주기에 cursor부터 재개.
      console.log(
        `details 스윕 예산 소진 (MAX_APPS_PER_SWEEP=${MAX_APPS_PER_SWEEP}) — 다음 주기에 cursor=${nextCursor}부터 재개`,
      );
    }

    await recordJobRun("details", circuitOpen ? "error" : "ok", processed);
    return NextResponse.json({
      ok: !circuitOpen,
      processed,
      cursor: nextCursor,
      hasMore,
      chained,
      remainingBudget,
    });
  } catch (err) {
    // 오류 메시지에 STEAM_API_KEY 등이 섞일 수 있으므로 내부 로그만 상세, 응답은 일반화
    console.error("details 실패:", err);
    await recordJobRun("details", "error", 0);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
