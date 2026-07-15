"use client";

import { useEffect, useRef } from "react";
import type { BubbleMapProps } from "@/lib/types";
import { createBubbleEngine, type BubbleEngine, type EngineUpdate } from "./engine";

// 버블맵 (CLAUDE.md 5-1) — d3-force 물리 + PixiJS 렌더링.
// next/dynamic ssr:false로 로드되는 클라이언트 전용 컴포넌트.
// React는 컨테이너 div만 소유하고, 캔버스/씬은 엔진이 diff 기반으로 직접 관리한다.
export default function BubbleMap({
  games,
  sizeBy,
  colorBy,
  showName,
  showChange,
  onSelect,
  className,
}: BubbleMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BubbleEngine | null>(null);
  const latestRef = useRef<EngineUpdate>({
    games,
    sizeBy,
    colorBy,
    showName,
    showChange,
    onSelect,
  });

  // 엔진 수명주기 — 마운트 1회. StrictMode 이중 마운트는 cancelled 가드로 정리
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: BubbleEngine | null = null;
    createBubbleEngine(host)
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        engine = created;
        engineRef.current = created;
        created.update(latestRef.current); // 초기화 완료 시점의 최신 props 적용
      })
      .catch(() => {
        // WebGL/WebGPU 초기화 실패 — 버블맵 없이 나머지 UI는 유지
      });
    return () => {
      cancelled = true;
      if (engineRef.current === engine) engineRef.current = null;
      engine?.destroy();
      engine = null;
    };
  }, []);

  // props 변경 → 엔진 diff 갱신 (React 리렌더는 캔버스를 건드리지 않음)
  useEffect(() => {
    const update: EngineUpdate = {
      games,
      sizeBy,
      colorBy,
      showName,
      showChange,
      onSelect,
    };
    latestRef.current = update;
    engineRef.current?.update(update);
  }, [games, sizeBy, colorBy, showName, showChange, onSelect]);

  return (
    <div
      ref={hostRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden${
        className ? ` ${className}` : ""
      }`}
    />
  );
}
