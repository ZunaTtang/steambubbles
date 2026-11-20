// 수집 파이프라인 헬스 점검 (읽기 전용) — 수집 중단 진단 + 복구 후 검증 겸용.
// 사용: node --env-file=.env scripts/check-pipeline.mjs
// env: DATABASE_URL(필수), QSTASH_TOKEN/QSTASH_URL(스케줄 점검), SITE_URL/CRON_SECRET(선택)
// 아무것도 변경하지 않는다. DB 쿼리는 Neon을 자동 unarchive(되살림)하는 부수효과만 있다.

const now = Date.now();
const H = 3_600_000;
const ago = (d) => {
  if (!d) return "없음";
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return `${new Date(t).toISOString()}  (${((now - t) / H).toFixed(1)}h 전)`;
};
const mask = (s) => (s ? `…${String(s).slice(-4)} (len ${String(s).length})` : "없음");

// 잡별 기대 주기(ms)와 "중단 의심" 임계(기대의 2배)
const EXPECT = {
  "players-tier1": 0.5 * H,
  "players-tier2": 0.5 * H,
  "players-tier3": 3 * H,
  details: 24 * H,
  universe: 24 * H,
  maintenance: 24 * H,
  healthcheck: 24 * H,
};

const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  QSTASH_URL: process.env.QSTASH_URL,
  SITE_URL: process.env.SITE_URL,
  CRON_SECRET: process.env.CRON_SECRET,
};
console.log("## env 상태 ----------------------------------------------");
for (const [k, v] of Object.entries(env)) {
  console.log(`  ${k.padEnd(14)} ${v ? "set" : "MISSING"}`);
}

// ---- DB ----------------------------------------------------------------
if (env.DATABASE_URL) {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(env.DATABASE_URL);

    console.log("\n## 잡별 마지막 성공(ok) + 중단 판정 ----------------------");
    const lastOk = await sql`
      select job, max(ts) as latest from job_runs where status='ok' group by job`;
    const byJob = new Map(lastOk.map((r) => [r.job, r.latest]));
    for (const job of Object.keys(EXPECT)) {
      const latest = byJob.get(job);
      const t = latest ? Date.parse(latest) : 0;
      const stale = !latest || now - t > EXPECT[job] * 2;
      console.log(`  ${stale ? "✗" : "✓"} ${job.padEnd(16)} ${ago(latest)}`);
    }

    console.log("\n## 데이터 신선도 ----------------------------------------");
    const snap = await sql`select count(*)::int c, max(ts) latest from player_snapshots`;
    console.log(`  player_snapshots count=${snap[0].c}  최신=${ago(snap[0].latest)}`);
    const pr = await sql`select count(*)::int c, max(updated_at) latest from prices`;
    console.log(`  prices           count=${pr[0].c}  최신=${ago(pr[0].latest)}`);
    const tier = await sql`select tier, count(*)::int c from apps group by tier order by tier`;
    console.log(`  apps by tier     ${tier.map((t) => `t${t.tier}=${t.c}`).join("  ")}`);

    console.log("\n## 최근 job_runs (10) -----------------------------------");
    const runs = await sql`select job, status, rows, ts from job_runs order by ts desc limit 10`;
    for (const r of runs) {
      console.log(`  ${new Date(r.ts).toISOString()}  ${r.job.padEnd(16)} ${r.status.padEnd(6)} rows=${r.rows}`);
    }
  } catch (e) {
    console.log("## DB 조회 실패:", e.message);
  }
} else {
  console.log("\n## DB 스킵 — DATABASE_URL 없음");
}

// ---- QStash ------------------------------------------------------------
if (env.QSTASH_TOKEN) {
  try {
    const { Client } = await import("@upstash/qstash");
    const client = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });

    console.log("\n## QStash 스케줄 ----------------------------------------");
    const schedules = await client.schedules.list();
    if (!schedules.length) console.log("  (스케줄 0개 — 트리거 소스 소실! 전면 재생성 필요)");
    for (const s of schedules) {
      // 헤더에서 Authorization 추출 (키 대소문자/배열 모두 대응)
      const h = s.header ?? s.headers ?? {};
      const authRaw = h.Authorization ?? h.authorization;
      const auth = Array.isArray(authRaw) ? authRaw[0] : authRaw;
      const token = auth?.replace(/^Bearer\s+/i, "");
      const matchLocal = env.CRON_SECRET ? token === env.CRON_SECRET : "?";
      const paused = s.isPaused ?? s.paused ?? false;
      console.log(`  ${s.scheduleId}  cron="${s.cron}"  paused=${paused}`);
      console.log(`      -> ${s.destination}`);
      console.log(`      Authorization=${mask(token)}  로컬CRON_SECRET과_일치=${matchLocal}`);
    }

    console.log("\n## QStash DLQ (실패 메시지, 최근 10) ----------------------");
    try {
      const dlq = await client.dlq.listMessages({ count: 10 });
      const msgs = dlq.messages ?? dlq ?? [];
      if (!msgs.length) console.log("  (DLQ 비어 있음)");
      for (const m of msgs) {
        console.log(`  status=${m.responseStatus ?? m.status ?? "?"}  ${m.url ?? m.destination ?? ""}  ${m.createdAt ? new Date(m.createdAt).toISOString() : ""}`);
      }
    } catch (e) {
      console.log("  DLQ 조회 스킵:", e.message);
    }
  } catch (e) {
    console.log("## QStash 조회 실패:", e.message, "— 토큰/리전(QSTASH_URL) 확인");
  }
} else {
  console.log("\n## QStash 스킵 — QSTASH_TOKEN 없음 (.env에 추가 후 재실행)");
}

// ---- 프로덕션 서빙 (선택) ----------------------------------------------
if (env.SITE_URL) {
  try {
    const r = await fetch(env.SITE_URL, { redirect: "manual" });
    console.log(`\n## 프로덕션 ${env.SITE_URL} -> HTTP ${r.status}`);
  } catch (e) {
    console.log(`\n## 프로덕션 ${env.SITE_URL} 접속 실패:`, e.message);
  }
}
