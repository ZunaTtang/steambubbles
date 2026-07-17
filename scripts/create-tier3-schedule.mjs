// players-tier3 QStash 스케줄 생성 (1회 실행) — 3시간 주기, 정시 회피 지터(:13).
// 사용: node --env-file=.env scripts/create-tier3-schedule.mjs
// env: QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET
// 멱등: 동일 destination 스케줄이 이미 있으면 생성하지 않는다.

import { Client } from "@upstash/qstash";

const { QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET } = process.env;
if (!QSTASH_TOKEN || !SITE_URL || !CRON_SECRET) {
  console.error("env 누락: QSTASH_TOKEN / SITE_URL / CRON_SECRET 필요");
  process.exit(1);
}

const destination = `${SITE_URL}/api/cron/players-tier3`;
const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });

const existing = await client.schedules.list();
const dup = existing.find((s) => s.destination === destination);
if (dup) {
  console.log(`이미 존재 — 스킵 (scheduleId: ${dup.scheduleId}, cron: ${dup.cron})`);
  process.exit(0);
}

const { scheduleId } = await client.schedules.create({
  destination,
  cron: "13 */3 * * *", // 일 8회, 정시(:00) 회피 (CLAUDE.md 3 지터 원칙)
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
console.log(`생성 완료 — scheduleId: ${scheduleId}, cron: 13 */3 * * *`);
console.log(`destination: ${destination}`);
