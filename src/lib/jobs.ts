import { getDb } from "@/db";
import { jobRuns } from "@/db/schema";
import { isMockMode } from "@/lib/data";

// 수집 잡 실행 기록 (CLAUDE.md 4-1) — 데드맨스위치 헬스체크의 근거.
// 기록 실패가 잡 본체를 깨뜨리면 안 되므로 절대 throw하지 않는다.

export async function recordJobRun(
  job: string,
  status: "ok" | "error",
  rows: number,
): Promise<void> {
  if (isMockMode()) return;
  try {
    await getDb().insert(jobRuns).values({ job, status, rows });
  } catch (err) {
    console.error(`job_runs 기록 실패 (${job}):`, err);
  }
}
