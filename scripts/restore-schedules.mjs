// [시나리오 B 복구] 소실된 QStash 스케줄을 전면 재생성.
// 스케줄이 삭제/초기화됐을 때, 아래 DESIRED 목록에 맞춰 "없는 것만" 생성한다(멱등).
//
// 사용:
//   node --env-file=.env scripts/restore-schedules.mjs           # dry-run (현재 vs 목표 비교만)
//   node --env-file=.env scripts/restore-schedules.mjs --apply   # 누락분 생성
// env: QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET (모두 필수)
//
// ⚠ cron 값: tier1/tier3는 리포 스크립트로 확정. 나머지(tier2·details·universe·maintenance·
//   healthcheck)는 콘솔 수동 생성이었어서 "원래 값"이 리포에 없다 — 아래는 합리적 기본값
//   (정시 :00 회피 지터 + 깨움 시각 분산으로 Neon 컴퓨트 pileup 방지)이며, 콘솔에 기존 값이
//   남아 있으면 그 값으로 DESIRED를 고친 뒤 실행할 것. 생성 후 콘솔에서 조정 가능.
// 참고: tier3는 players-tier2 마지막 배치가 셀프 킥오프하므로(CLAUDE.md 3-2) 전용 스케줄이
//   없어도 tier2만 살아있으면 돈다 — 여기 둔 건 중복 안전(이중 발화해도 신선도 검사로 무해).

import { Client } from "@upstash/qstash";

const { QSTASH_TOKEN, QSTASH_URL, SITE_URL, CRON_SECRET } = process.env;
const APPLY = process.argv.includes("--apply");

if (!QSTASH_TOKEN || !QSTASH_URL || !SITE_URL || !CRON_SECRET) {
  console.error("env 누락: QSTASH_TOKEN / QSTASH_URL / SITE_URL / CRON_SECRET 모두 필요");
  process.exit(1);
}

// path → cron. src: confirmed=리포에서 확인 / default=확인필요(콘솔 기존값 있으면 교체)
const DESIRED = [
  { path: "/api/cron/players-tier1", cron: "13,43 * * * *", src: "confirmed" },
  // 2026-11 Neon 컴퓨트 절감: 전 잡을 tier1과 같은 깨움 창(:13/:43)에 정렬 (align-schedules.mjs와 동일)
  { path: "/api/cron/players-tier2", cron: "13,43 * * * *", src: "confirmed" },
  { path: "/api/cron/players-tier3", cron: "13 */3 * * *", src: "confirmed" },
  { path: "/api/cron/details", cron: "13 15 * * *", src: "confirmed", body: { tiers: [1], batchSize: 3 } },
  { path: "/api/cron/universe", cron: "43 15 * * *", src: "confirmed" },
  { path: "/api/cron/maintenance", cron: "43 15 * * *", src: "confirmed" }, // 롤업/정리
  { path: "/api/cron/healthcheck", cron: "13 15 * * *", src: "confirmed" },
];

const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });

// 안전검증: CRON_SECRET이 프로덕션에서 통하는가 (없는 스케줄을 이 시크릿으로 만들기 전에)
try {
  const r = await fetch(`${SITE_URL}/api/cron/healthcheck`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (r.status === 401) {
    console.error(
      "✗ 프로덕션 인증 실패 (HTTP 401) — .env의 CRON_SECRET이 Vercel 현재 값과 다릅니다.\n" +
        "  이 값으로 스케줄을 만들면 프로덕션이 계속 401입니다. Vercel 값으로 맞춘 뒤 다시 실행하세요.",
    );
    process.exit(1);
  }
  console.log(`✓ 프로덕션 인증 확인: HTTP ${r.status}\n`);
} catch (e) {
  console.warn(`! 프로덕션 검증 실패(${e.message}) — 계속 진행하나 CRON_SECRET↔Vercel 일치를 수동 확인하세요\n`);
}

const existing = await client.schedules.list();
const findByPath = (path) =>
  existing.find((s) => typeof s.destination === "string" && s.destination.endsWith(path));

console.log(`${APPLY ? "== 누락분 생성 ==" : "== dry-run (현재 vs 목표) =="}\n`);
let created = 0;
for (const d of DESIRED) {
  const found = findByPath(d.path);
  const tag = d.src === "default" ? " [기본값·확인권장]" : "";
  if (found) {
    const same = found.cron === d.cron;
    console.log(`  = 존재: ${d.path}  cron="${found.cron}"${same ? "" : `  (목표 "${d.cron}"와 다름 — 유지)`}`);
    continue;
  }
  created++;
  console.log(`  ${APPLY ? "→ 생성" : "→ [dry] 생성 예정"}: ${d.path}  cron="${d.cron}"${tag}`);
  if (APPLY) {
    try {
      const { scheduleId } = await client.schedules.create({
        destination: `${SITE_URL}${d.path}`,
        cron: d.cron,
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
          ...(d.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(d.body ? { body: JSON.stringify(d.body) } : {}),
      });
      console.log(`        ✓ scheduleId=${scheduleId}`);
    } catch (e) {
      console.error(`        ✗ 실패: ${e.message}`);
    }
  }
}

console.log(
  `\n${created === 0 ? "누락 스케줄 없음 — 전부 존재." : APPLY ? `${created}개 생성 완료.` : `${created}개 생성 예정. 적용하려면 --apply 추가.`}`,
);
console.log("※ 이미 존재하나 Authorization이 틀어진 경우엔 resign-schedules.mjs로 헤더를 맞추세요.");
if (APPLY && created > 0) console.log("검증: node --env-file=.env scripts/check-pipeline.mjs");
