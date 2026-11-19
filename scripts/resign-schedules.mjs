// [시나리오 A 복구] QStash 스케줄의 Authorization 헤더를 현재 CRON_SECRET으로 재서명.
// 원인: Vercel의 CRON_SECRET이 로테이션됐는데 스케줄에 저장된 옛 시크릿 헤더가 그대로라
//       QStash는 발사하지만 프로덕션이 전부 401 → 수집 전면 중단 → DB 아카이브.
//
// 사용:
//   node --env-file=.env scripts/resign-schedules.mjs            # dry-run (변경 미적용)
//   node --env-file=.env scripts/resign-schedules.mjs --apply    # 실제 재서명
// env: QSTASH_TOKEN, QSTASH_URL (필수) · CRON_SECRET (필수) · SITE_URL (안전검증용 권장)
//
// 안전장치: --apply 전에 SITE_URL/api/cron/healthcheck를 현재 CRON_SECRET으로 호출해
//   401이면 중단한다. (.env의 CRON_SECRET이 프로덕션과 다른 값이면, 그 값으로 재서명해봤자
//   프로덕션이 계속 401이기 때문. 반드시 .env의 CRON_SECRET = Vercel 현재 값으로 먼저 맞출 것.)
// 동작: 같은 scheduleId로 create를 호출해 스케줄을 "제자리 덮어쓰기"(id·cron·destination 보존,
//   Authorization만 교체, 그 외 헤더는 유지). 이미 일치하는 스케줄은 건너뛴다(멱등).

import { Client } from "@upstash/qstash";

const { QSTASH_TOKEN, QSTASH_URL, CRON_SECRET, SITE_URL } = process.env;
const APPLY = process.argv.includes("--apply");

if (!QSTASH_TOKEN || !QSTASH_URL || !CRON_SECRET) {
  console.error("env 누락: QSTASH_TOKEN / QSTASH_URL / CRON_SECRET 필요");
  process.exit(1);
}

const mask = (s) => (s ? `…${String(s).slice(-4)}` : "(없음)");
// list는 header: Record<string,string[]> — 평탄화(첫 값) + 원래 키 보존
const flatten = (header) => {
  const out = {};
  for (const [k, v] of Object.entries(header ?? {})) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
};
const stripAuth = (flat) => {
  const out = {};
  for (const [k, v] of Object.entries(flat)) if (k.toLowerCase() !== "authorization") out[k] = v;
  return out;
};

const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });

// ---- 안전검증: 이 CRON_SECRET이 프로덕션에서 통하는가 ----
if (SITE_URL) {
  try {
    const r = await fetch(`${SITE_URL}/api/cron/healthcheck`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    if (r.status === 401) {
      console.error(
        `✗ 프로덕션 인증 실패 (HTTP 401) — .env의 CRON_SECRET이 Vercel 현재 값과 다릅니다.\n` +
          `  이 값으로 재서명하면 프로덕션이 계속 401입니다. Vercel의 CRON_SECRET을 .env에 맞춘 뒤 다시 실행하세요.`,
      );
      process.exit(1);
    }
    console.log(`✓ 프로덕션 인증 확인: HTTP ${r.status} (401 아님 → 이 CRON_SECRET으로 재서명 안전)\n`);
  } catch (e) {
    console.warn(`! 프로덕션 검증 실패(${e.message}) — 계속 진행하나 CRON_SECRET↔Vercel 일치를 수동 확인하세요\n`);
  }
} else {
  console.warn("! SITE_URL 없음 — 재서명 전 CRON_SECRET↔Vercel 일치를 수동 확인하세요\n");
}

const all = await client.schedules.list();
const targets = all.filter((s) => typeof s.destination === "string" && s.destination.includes("/api/cron/"));
if (targets.length === 0) {
  console.log("대상 스케줄 없음 (/api/cron/* destination). 스케줄 자체가 소실됐다면 restore-schedules.mjs를 쓰세요.");
  process.exit(0);
}

console.log(`${APPLY ? "== 재서명 적용 ==" : "== dry-run (미적용) =="}  대상 ${targets.length}개\n`);
let changed = 0;
for (const s of targets) {
  const flat = flatten(s.header);
  const curTok = (flat.Authorization ?? flat.authorization ?? "").replace(/^Bearer\s+/i, "");
  const path = s.destination.replace(/^https?:\/\/[^/]+/, "");
  if (curTok === CRON_SECRET) {
    console.log(`  = 이미 일치, 스킵: ${path}`);
    continue;
  }
  changed++;
  console.log(`  ${APPLY ? "→ 재서명" : "→ [dry] 재서명 예정"}: ${s.scheduleId}  ${path}`);
  console.log(`        cron="${s.cron}"  Authorization ${mask(curTok)} → ${mask(CRON_SECRET)}`);
  if (APPLY) {
    try {
      await client.schedules.create({
        scheduleId: s.scheduleId, // 같은 id → 제자리 덮어쓰기
        destination: s.destination,
        cron: s.cron,
        method: s.method,
        ...(s.body ? { body: s.body } : {}),
        ...(typeof s.retries === "number" ? { retries: s.retries } : {}),
        headers: { ...stripAuth(flat), Authorization: `Bearer ${CRON_SECRET}` },
      });
      console.log(`        ✓ 완료`);
    } catch (e) {
      console.error(`        ✗ 실패: ${e.message}`);
    }
  }
}

console.log(`\n${changed === 0 ? "모든 스케줄이 이미 일치 — 변경 없음." : APPLY ? `${changed}개 재서명 완료.` : `${changed}개 재서명 예정. 적용하려면 --apply 추가.`}`);
if (APPLY && changed > 0) console.log("검증: node --env-file=.env scripts/check-pipeline.mjs");
