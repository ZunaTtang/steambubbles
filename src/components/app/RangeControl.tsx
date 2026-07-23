"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RangeKey } from "@/lib/types";
import {
  DEEP_SCOPE_MAX_RANK,
  MAX_RANGE_SPAN,
  RANGES,
  RANGE_BOUNDS,
} from "@/lib/types";

// 순위 범위 컨트롤 (CLAUDE.md 5-1) — 프리셋 밴드 + 커스텀 직접 입력을 한 팝오버로 통합.
// 13밴드 셀렉트를 대체: 프리셋 그리드에서 고르거나, min/max를 직접 입력해 임의 구간을 본다.
// 커스텀 값은 [1, DEEP_SCOPE_MAX_RANK]로 clamp하고 스팬은 MAX_RANGE_SPAN개로 제한(가독성·60fps).

interface RangeControlProps {
  range: RangeKey;
  customRange: readonly [number, number] | null;
  // 실측 최대 랭크(deep 적용 후) — null이면 미지(전 구간 허용, 커스텀 상한은 DEEP_SCOPE_MAX_RANK)
  maxAvailableRank: number | null;
  onSelectPreset: (r: RangeKey) => void;
  onApplyCustom: (min: number, max: number) => void;
}

export default function RangeControl({
  range,
  customRange,
  maxAvailableRank,
  onSelectPreset,
  onApplyCustom,
}: RangeControlProps) {
  const t = useTranslations("controls");
  const [open, setOpen] = useState(false);
  const [minVal, setMinVal] = useState<number>(1);
  const [maxVal, setMaxVal] = useState<number>(100);
  const minInputRef = useRef<HTMLInputElement>(null);

  const rangeLabel = useCallback(
    (r: RangeKey) =>
      r === "top100"
        ? t("rangeTop100")
        : t("rangeBand", { lo: RANGE_BOUNDS[r][0], hi: RANGE_BOUNDS[r][1] }),
    [t],
  );

  const activeBounds = customRange ?? RANGE_BOUNDS[range];
  const activeLabel = customRange
    ? t("rangeBand", { lo: customRange[0], hi: customRange[1] })
    : rangeLabel(range);

  // 실측 최대를 아는 상태(deep 적용 후)면 데이터 밖 프리셋은 목록에서 제외
  const visibleRanges =
    maxAvailableRank === null
      ? RANGES
      : RANGES.filter((r) => RANGE_BOUNDS[r][0] <= maxAvailableRank);

  const openPopover = () => {
    // 열 때 입력값을 현재 활성 범위로 초기화
    setMinVal(activeBounds[0]);
    setMaxVal(activeBounds[1]);
    setOpen(true);
  };

  const pickPreset = (r: RangeKey) => {
    onSelectPreset(r);
    setOpen(false);
  };

  const applyCustom = () => {
    if (Number.isNaN(minVal) || Number.isNaN(maxVal)) return;
    const absMax = maxAvailableRank ?? DEEP_SCOPE_MAX_RANK;
    let lo = Math.max(1, Math.min(minVal, maxVal));
    let hi = Math.min(Math.max(minVal, maxVal), absMax);
    lo = Math.min(lo, hi);
    // 스팬 상한 — 한 화면 노드 수 제한 (가독성·성능)
    if (hi - lo + 1 > MAX_RANGE_SPAN) hi = lo + MAX_RANGE_SPAN - 1;
    onApplyCustom(lo, hi);
    setOpen(false);
  };

  const invalid = Number.isNaN(minVal) || Number.isNaN(maxVal);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-expanded={open}
        aria-label={t("range")}
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs md:py-1 ${
          customRange
            ? "border-[#16c784]/50 bg-[#16c784]/10 text-[#16c784]"
            : "border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-600"
        }`}
      >
        <span className="whitespace-nowrap">{activeLabel}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="opacity-70"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <>
          {/* 외부 클릭 닫기 백드롭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="anim-pop origin-top-left absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-neutral-800 bg-neutral-900 p-3 shadow-xl"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            {/* 프리셋 */}
            <div className="mb-1 text-[11px] font-medium text-neutral-500">
              {t("range")}
            </div>
            <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto [scrollbar-width:thin]">
              {visibleRanges.map((r) => {
                const active = !customRange && r === range;
                return (
                  <button
                    key={r}
                    onClick={() => pickPreset(r)}
                    aria-pressed={active}
                    className={`rounded border px-2 py-1.5 text-left text-xs transition active:scale-[0.98] ${
                      active
                        ? "border-[#16c784]/60 bg-[#16c784]/10 text-[#16c784]"
                        : "border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
                    }`}
                  >
                    {rangeLabel(r)}
                  </button>
                );
              })}
            </div>

            {/* 직접 입력 */}
            <div className="mt-3 border-t border-neutral-800 pt-3">
              <div className="mb-1.5 text-[11px] font-medium text-neutral-500">
                {t("customRange")}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={minInputRef}
                  type="number"
                  min={1}
                  max={DEEP_SCOPE_MAX_RANK}
                  value={Number.isNaN(minVal) ? "" : minVal}
                  aria-label={t("rankMin")}
                  onChange={(e) => setMinVal(e.target.valueAsNumber)}
                  onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                  className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 focus:border-neutral-600 focus:outline-none"
                />
                <span className="shrink-0 text-neutral-600">~</span>
                <input
                  type="number"
                  min={1}
                  max={DEEP_SCOPE_MAX_RANK}
                  value={Number.isNaN(maxVal) ? "" : maxVal}
                  aria-label={t("rankMax")}
                  onChange={(e) => setMaxVal(e.target.valueAsNumber)}
                  onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                  className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 focus:border-neutral-600 focus:outline-none"
                />
                <button
                  onClick={applyCustom}
                  disabled={invalid}
                  className="shrink-0 rounded bg-[#16c784] px-3 py-1.5 text-xs font-semibold text-[#052e1c] transition hover:bg-[#13b676] active:scale-[0.98] disabled:opacity-40"
                >
                  {t("apply")}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-600">
                {t("maxNodesHint", { count: MAX_RANGE_SPAN })}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
