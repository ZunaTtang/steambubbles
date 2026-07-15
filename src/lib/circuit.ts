import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { circuitState } from "@/db/schema";
import { sendAlert } from "./alerts";
import { isMockMode } from "./data";
import type { SteamDomain } from "./fetch-util";

// 도메인별 서킷브레이커 (CLAUDE.md 3) — 상태를 DB에 지속화한다.
// 서버리스 함수는 인보케이션마다 인스턴스 메모리가 초기화되고, players-tier1은
// 10분당 api 콜 1번, details는 앱당 실패를 개별 스킵하므로 "인메모리 연속 실패"로는
// 임계치에 절대 도달하지 못한다. 따라서 QStash 체인·콜드스타트를 가로질러 누적되도록
// circuit_state 테이블에 실패 카운터와 오픈 시각을 저장한다.

const FAILURE_THRESHOLD = 3; // 창(window) 내 재시도 소진 3회 → 오픈
const FAILURE_WINDOW_MS = 5 * 60_000; // 마지막 실패가 이보다 오래됐으면 카운터 리셋
const OPEN_MS = 10 * 60_000; // 오픈 유지 시간

// 인메모리 캐시: 매 호출 DB 왕복을 피하기 위한 것. 오픈 상태만 짧게 캐싱한다.
const memOpenUntil: Record<SteamDomain, number> = { api: 0, store: 0 };
const memCheckedAt: Record<SteamDomain, number> = { api: 0, store: 0 };
const MEM_TTL_MS = 30_000;

export async function isCircuitOpen(domain: SteamDomain): Promise<boolean> {
  const now = Date.now();
  if (now < memOpenUntil[domain]) return true;
  if (isMockMode()) return false;
  // 인메모리가 닫힘이면, 타 인스턴스가 열었을 수 있으므로 주기적으로 DB와 동기화
  if (now - memCheckedAt[domain] < MEM_TTL_MS) return false;
  memCheckedAt[domain] = now;
  try {
    const rows = await getDb()
      .select({ openUntil: circuitState.openUntil })
      .from(circuitState)
      .where(eq(circuitState.domain, domain));
    const openUntil = rows[0]?.openUntil
      ? new Date(rows[0].openUntil).getTime()
      : 0;
    memOpenUntil[domain] = openUntil;
    return now < openUntil;
  } catch {
    // DB 접근 실패 시 가용성 우선 — 브레이커는 닫힘으로 취급
    return false;
  }
}

// 재시도를 모두 소진한 호출 1건을 실패로 계상. 창 내 연속 실패가 임계치에 도달하면
// 오픈 전환 + Discord 알림 1회 (오픈 중에는 isCircuitOpen이 먼저 throw하므로 재도달 없음).
export async function recordFailure(domain: SteamDomain): Promise<void> {
  if (isMockMode()) return;
  try {
    const db = getDb();
    const now = Date.now();
    const rows = await db
      .select({ failures: circuitState.failures, updatedAt: circuitState.updatedAt })
      .from(circuitState)
      .where(eq(circuitState.domain, domain));
    const prev = rows[0];
    const lastTs = prev?.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const withinWindow = prev && now - lastTs < FAILURE_WINDOW_MS;
    const failures = (withinWindow ? prev.failures : 0) + 1;
    const open = failures >= FAILURE_THRESHOLD;
    const openUntil = open ? new Date(now + OPEN_MS) : null;
    const nowDate = new Date(now);

    await db
      .insert(circuitState)
      .values({
        domain,
        failures: open ? 0 : failures,
        openUntil,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: circuitState.domain,
        set: { failures: open ? 0 : failures, openUntil, updatedAt: nowDate },
      });

    if (open) {
      memOpenUntil[domain] = now + OPEN_MS;
      await sendAlert(
        `서킷브레이커 발동: ${domain} 도메인 ${FAILURE_THRESHOLD}회 연속 실패 — ${OPEN_MS / 60_000}분간 호출 중단`,
      );
    }
  } catch (err) {
    console.error(`circuit_state 갱신 실패 (${domain}):`, err);
  }
}
