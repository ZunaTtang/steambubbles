// players-tier1 QStash 스케줄 주기 변경 (1회 실행) — 10분 → 30분.
// Neon 무료 compute-hours 조기 소진 대응(2026-10): tier1이 10분마다 DB를 깨워
// scale-to-zero 5분 꼬리까지 과금 → 컴퓨트가 사실상 상시 가동. 깨움 빈도를 절반 이하로.
// 사용: node --env-file=.env scripts/update-tier1-schedule.mjs
// env: QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET
// 동작: 기존 players-tier1 스케줄(중복 포함)을 전부 지우고 30분 주기 1개로 재생성.

import { Client } from "@upstash/qstash";

const { QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET } = process.env;
if (!QSTASH_TOKEN || !SITE_URL || !CRON_SECRET) {
  console.error("env 누락: QSTASH_TOKEN / SITE_URL / CRON_SECRET 필요");
  process.exit(1);
}

// 30분 주기, 정시(:00/:30) 회피 지터 — CLAUDE.md 3 지터 원칙(tier3 :13과 동일 컨벤션)
const TARGET_CRON = "13,43 * * * *";
const PATH = "/api/cron/players-tier1";
const destination = `${SITE_URL}${PATH}`;
const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });

const existing = await client.schedules.list();
// destination 경로로 매칭 (SITE_URL 베이스가 달라도 잡히도록 endsWith). 중복 스케줄도 모두 포함.
const matches = existing.filter((s) =>
  typeof s.destination === "string" && s.destination.endsWith(PATH),
);

if (matches.length === 0) {
  console.error(
    `players-tier1 스케줄을 찾지 못함 (검색 경로: *${PATH}).\n` +
      "QStash 콘솔에서 수동으로 생성했거나 destination이 다를 수 있음 — " +
      "콘솔에서 직접 cron을 '13,43 * * * *'로 바꾸거나, 아래 전체 목록 확인:",
  );
  for (const s of existing) {
    console.error(`  - ${s.scheduleId}  cron="${s.cron}"  ${s.destination}`);
  }
  process.exit(1);
}

console.log(`현재 players-tier1 스케줄 ${matches.length}개:`);
for (const s of matches) {
  console.log(`  - scheduleId=${s.scheduleId}  cron="${s.cron}"  ${s.destination}`);
}

// 이미 30분 1개로 정리돼 있으면 멱등 스킵
if (matches.length === 1 && matches[0].cron === TARGET_CRON) {
  console.log(`이미 "${TARGET_CRON}" 1개 — 변경 불필요. 종료.`);
  process.exit(0);
}

// 기존(중복 포함) 전부 삭제 후 1개로 재생성
for (const s of matches) {
  await client.schedules.delete(s.scheduleId);
  console.log(`삭제: ${s.scheduleId} (cron="${s.cron}")`);
}

const { scheduleId } = await client.schedules.create({
  destination,
  cron: TARGET_CRON,
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
console.log(`\n생성 완료 — scheduleId=${scheduleId}, cron="${TARGET_CRON}"`);
console.log(`destination: ${destination}`);
console.log("tier1 갱신 주기: 10분 → 30분 (일 144회 → 48회 깨움)");
