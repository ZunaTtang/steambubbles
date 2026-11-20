// [Neon 컴퓨트 절감] QStash 스케줄의 cron을 "공유 깨움 창"으로 정렬한다.
// 원리: Neon 무료는 마지막 쿼리 후 5분 뒤 scale-to-zero하지만 그 5분 꼬리까지 과금된다.
//   크론이 서로 다른 분에 흩어지면 깨움마다 5분 꼬리가 따로 붙는다 → 같은 분(:13/:43)에
//   몰아서 한 번 깨운 창을 함께 쓰게 한다. (2026-11, 수집 중단·아카이브 사건 후 결정)
//
// 사용:
//   node --env-file=.env scripts/align-schedules.mjs            # dry-run
//   node --env-file=.env scripts/align-schedules.mjs --apply    # 적용
// env: QSTASH_TOKEN, QSTASH_URL (기본 us-east-1)
// 동작: path로 스케줄을 찾아 같은 scheduleId로 덮어쓴다(헤더·body·method 보존, cron만 교체). 멱등.

import { Client } from "@upstash/qstash";

const QSTASH_URL = process.env.QSTASH_URL ?? "https://qstash-us-east-1.upstash.io";
const { QSTASH_TOKEN } = process.env;
const APPLY = process.argv.includes("--apply");
if (!QSTASH_TOKEN) {
  console.error("env 누락: QSTASH_TOKEN");
  process.exit(1);
}

// 30분 창 2개(:13, :43). 일일 잡도 이 창 안에 넣는다(15시 UTC = 00시 KST, 트래픽 저점).
// tier3는 players-tier2 마지막 배치가 셀프 킥오프 → 같은 창에서 이어 돈다(전용 스케줄 불필요).
const TARGET = {
  "/api/cron/players-tier1": "13,43 * * * *",
  "/api/cron/players-tier2": "13,43 * * * *",
  "/api/cron/healthcheck": "13 15 * * *",
  "/api/cron/details": "13 15 * * *",
  "/api/cron/universe": "43 15 * * *",
  "/api/cron/maintenance": "43 15 * * *",
};

const flatten = (header) => {
  const out = {};
  for (const [k, v] of Object.entries(header ?? {})) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
};

const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });
const all = await client.schedules.list();
console.log(APPLY ? "== 적용 ==" : "== dry-run (미적용) ==");

let changed = 0;
for (const s of all) {
  const path = String(s.destination).replace(/^https?:\/\/[^/]+/, "");
  const cron = TARGET[path];
  if (!cron) continue;
  if (s.cron === cron) {
    console.log(`  = 일치: ${path}  "${cron}"`);
    continue;
  }
  changed++;
  console.log(`  → ${path}  "${s.cron}" → "${cron}"`);
  if (APPLY) {
    const flat = flatten(s.header);
    // QStash가 붙이는 내부 헤더는 재전송하지 않는다
    const headers = Object.fromEntries(
      Object.entries(flat).filter(([k]) => !/^upstash-/i.test(k)),
    );
    await client.schedules.create({
      scheduleId: s.scheduleId,
      destination: s.destination,
      cron,
      method: s.method,
      ...(s.body ? { body: s.body } : {}),
      ...(typeof s.retries === "number" ? { retries: s.retries } : {}),
      headers,
    });
    console.log("      ✓ 완료");
  }
}
const missing = Object.keys(TARGET).filter(
  (p) => !all.some((s) => String(s.destination).endsWith(p)),
);
if (missing.length) console.log(`! 스케줄 없음: ${missing.join(", ")} → restore-schedules.mjs`);
console.log(changed ? `${changed}개 ${APPLY ? "변경 완료" : "변경 예정 (--apply)"}` : "변경 없음");
