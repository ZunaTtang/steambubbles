// 크론 핸들러 수동 트리거 — 배포 직후 초기 적재나 디버깅용.
// 사용: node --env-file=.env scripts/trigger-cron.mjs <job> [--local]
//   예: node --env-file=.env scripts/trigger-cron.mjs universe
//       node --env-file=.env scripts/trigger-cron.mjs players-tier3 --local
// env: CRON_SECRET (필수), SITE_URL (--local이 아니면 필수)

const job = process.argv[2];
const local = process.argv.includes("--local");
const base = local ? "http://localhost:3000" : process.env.SITE_URL;

if (!job || !process.env.CRON_SECRET || !base) {
  console.error(
    "사용법: node --env-file=.env scripts/trigger-cron.mjs <job> [--local]\n" +
      "필요 env: CRON_SECRET" + (local ? "" : ", SITE_URL"),
  );
  process.exit(1);
}

const url = `${base}/api/cron/${job}`;
console.log(`POST ${url}`);
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
