"use client";

import { useEffect } from "react";

// 상세 페이지 조회 시 온디맨드 갱신을 fire-and-forget으로 트리거 (CLAUDE.md 3-3).
// 응답은 쓰지 않는다 — 서버가 갱신하면 다음 ISR 재검증/방문에 신선한 가격·평점·소개가
// 반영된다. 서버 쿨다운(6h)이 store 콜을 게이트하므로 새로고침 반복에도 안전.
export default function RefreshOnView({ appid }: { appid: number }) {
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/refresh/${appid}`, {
      method: "POST",
      signal: ctrl.signal,
    }).catch(() => {
      // 갱신 실패는 무시 — 상세 페이지는 기존 값으로 정상 동작
    });
    return () => ctrl.abort();
  }, [appid]);
  return null;
}
