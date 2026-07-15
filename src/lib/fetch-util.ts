import { isCircuitOpen, recordFailure } from "./circuit";

// 공통 fetch 유틸 (CLAUDE.md 3) — 429/5xx/네트워크 오류 시 지수 백오프,
// 도메인별 서킷브레이커(연속 실패 시 일시 중단 + Discord 알림 1회, circuit.ts).

export type SteamDomain = "api" | "store";

export class CircuitOpenError extends Error {
  constructor(public readonly domain: SteamDomain) {
    super(`서킷 오픈 (${domain}): 호출 일시 중단 중`);
    this.name = "CircuitOpenError";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE_DELAY_MS = 1_000;
// 재시도 총 백오프가 함수 실행 예산(및 store 스로틀 창)을 넘지 않도록 낮게 유지.
// 잔여 실패는 QStash 재시도/체인으로 이어간다 (CLAUDE.md 4-1).
const DEFAULT_MAX_RETRIES = 2;
// store 도메인 재시도 간격 하한 — 429 직후에도 1.6s 스로틀을 위반하지 않는다 (CLAUDE.md 3-3)
const STORE_MIN_DELAY_MS = 1_600;

// 1s base ×2^attempt, ±30% 지터. store 도메인은 1.6s 하한 적용.
function backoffDelay(attempt: number, domain: SteamDomain): number {
  const base = BASE_DELAY_MS * 2 ** attempt;
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  const delay = Math.max(0, Math.round(base + jitter));
  return domain === "store" ? Math.max(delay, STORE_MIN_DELAY_MS) : delay;
}

// URL의 key= 쿼리값 마스킹 — STEAM_API_KEY가 로그·에러 응답·QStash 로그로 유출되지 않도록 (CWE-532)
function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]*/gi, "$1***");
}

export interface FetchJsonOptions {
  domain: SteamDomain;
  init?: RequestInit;
  maxRetries?: number;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  opts: FetchJsonOptions,
): Promise<T> {
  const { domain, init, maxRetries = DEFAULT_MAX_RETRIES } = opts;
  if (await isCircuitOpen(domain)) throw new CircuitOpenError(domain);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffDelay(attempt - 1, domain));

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastError = err; // 네트워크 오류 → 재시도
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`HTTP ${res.status} (${domain}): ${redactUrl(url)}`);
      continue; // 재시도 대상
    }
    if (!res.ok) {
      // 429 외 4xx: 도메인 장애가 아닌 요청 문제 — 재시도·브레이커 계상 없이 즉시 실패
      throw new Error(`HTTP ${res.status} (${domain}): ${redactUrl(url)}`);
    }

    try {
      return (await res.json()) as T;
    } catch (err) {
      lastError = err; // 본문 파싱 실패 → 재시도
    }
  }

  // 재시도 소진 → 실패 1회 계상 (브레이커 상태는 DB에 지속화)
  await recordFailure(domain);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
