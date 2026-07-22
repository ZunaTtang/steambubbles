"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { BubbleMapProps, GameBubbleData } from "@/lib/types";
import {
  formatChangePct,
  formatPlayersFull,
  formatSharePct,
} from "@/lib/format";
import { createBubbleEngine, type BubbleEngine, type EngineUpdate } from "./engine";

// 버블맵 (CLAUDE.md 5-1) — d3-force 물리 + PixiJS 렌더링.
// next/dynamic ssr:false로 로드되는 클라이언트 전용 컴포넌트.
// React는 컨테이너 div + hover 툴팁만 소유하고, 캔버스/씬은 엔진이 diff 기반으로 직접 관리한다.
export default function BubbleMap({
  games,
  sizeBy,
  colorBy,
  showName,
  showChange,
  onSelect,
  onReady,
  className,
}: BubbleMapProps) {
  const tControls = useTranslations("controls");
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BubbleEngine | null>(null);
  // 최신 onReady 참조 (마운트 1회 effect에서 안전하게 호출)
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // hover 툴팁 — 내용은 state, 위치는 커서를 따라 ref로 직접 갱신(리렌더 회피)
  const [hoverGame, setHoverGame] = useState<GameBubbleData | null>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const onHover = useCallback((g: GameBubbleData | null) => setHoverGame(g), []);

  const latestRef = useRef<EngineUpdate>({
    games,
    sizeBy,
    colorBy,
    showName,
    showChange,
    onSelect,
    onHover,
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
        created.update(latestRef.current);
        // 공유 기능용 캡처 핸들 노출
        onReadyRef.current?.({
          capture: (r) => created.captureViewport(r),
        });
      })
      .catch(() => {
        // WebGL/WebGPU 초기화 실패 — 버블맵 없이 나머지 UI는 유지
      });
    return () => {
      cancelled = true;
      if (engineRef.current === engine) engineRef.current = null;
      onReadyRef.current?.(null);
      engine?.destroy();
      engine = null;
    };
  }, []);

  useEffect(() => {
    const update: EngineUpdate = {
      games,
      sizeBy,
      colorBy,
      showName,
      showChange,
      onSelect,
      onHover,
    };
    latestRef.current = update;
    engineRef.current?.update(update);
  }, [games, sizeBy, colorBy, showName, showChange, onSelect, onHover]);

  // 커서 위치 추적 + 툴팁 위치 직접 갱신 (state 변경 없이)
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    cursorRef.current = { x: e.clientX, y: e.clientY };
    positionTooltip(tooltipRef.current, e.clientX, e.clientY);
  }, []);

  return (
    <div
      ref={hostRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverGame(null)}
      className={`relative h-full w-full touch-none select-none overflow-hidden${
        className ? ` ${className}` : ""
      }`}
    >
      {/* 팬/줌 리셋 — 특히 모바일에서 줌아웃하다 길을 잃었을 때 복귀 버튼 */}
      <button
        type="button"
        onClick={() => engineRef.current?.resetView()}
        aria-label={tControls("resetView")}
        title={tControls("resetView")}
        className="absolute bottom-3 right-3 z-10 rounded-full border border-neutral-700/80 bg-[#12121a]/80 p-2.5 text-neutral-300 shadow-lg backdrop-blur-sm transition-colors hover:border-neutral-500 hover:text-white active:scale-95"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2H3a1 1 0 0 0-1 1v3M10 2h3a1 1 0 0 1 1 1v3M14 10v3a1 1 0 0 1-1 1h-3M2 10v3a1 1 0 0 0 1 1h3" />
        </svg>
      </button>
      {hoverGame && (
        <BubbleTooltip
          ref={tooltipRef}
          game={hoverGame}
          initial={cursorRef.current}
        />
      )}
    </div>
  );
}

function positionTooltip(el: HTMLDivElement | null, x: number, y: number): void {
  if (!el) return;
  const pad = 14;
  const w = el.offsetWidth || 180;
  const h = el.offsetHeight || 120;
  let left = x + pad;
  let top = y + pad;
  if (left + w > window.innerWidth) left = x - w - pad;
  if (top + h > window.innerHeight) top = y - h - pad;
  el.style.left = `${Math.max(4, left)}px`;
  el.style.top = `${Math.max(4, top)}px`;
}

function BubbleTooltip({
  ref,
  game,
  initial,
}: {
  ref: React.Ref<HTMLDivElement>;
  game: GameBubbleData;
  initial: { x: number; y: number };
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const changeColor =
    game.changePct === null
      ? "text-neutral-400"
      : game.changePct >= 0
        ? "text-[#16c784]"
        : "text-[#ea3943]";
  return (
    <div
      ref={ref}
      style={{ left: initial.x + 14, top: initial.y + 14 }}
      className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-neutral-700 bg-[#12121a]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm"
    >
      <div className="mb-1.5 max-w-[210px] truncate text-sm font-bold text-neutral-100">
        {game.name}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-neutral-500">{t("modal.players")}</dt>
        <dd className="text-right font-semibold text-neutral-100">
          {formatPlayersFull(game.players, locale)}
        </dd>
        <dt className="text-neutral-500">{t("table.rank")}</dt>
        <dd className="text-right font-semibold text-neutral-100">
          #{game.rank}
        </dd>
        <dt className="text-neutral-500">{t("table.change")}</dt>
        <dd className={`text-right font-semibold ${changeColor}`}>
          {game.changePct === null ? "—" : formatChangePct(game.changePct)}
        </dd>
        <dt className="text-neutral-500">{t("common.marketShare")}</dt>
        <dd className="text-right font-semibold text-neutral-300">
          {formatSharePct(game.sharePct)}
        </dd>
      </dl>
    </div>
  );
}
