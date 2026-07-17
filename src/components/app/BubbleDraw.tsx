"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { GameBubbleData, RangeKey } from "@/lib/types";
import { RANGES, RANGE_BOUNDS, TOP_SCOPE_MAX_RANK } from "@/lib/types";
import { formatPlayersFull, formatPrice } from "@/lib/format";

// 버블 뽑기 (CLAUDE.md 5-1) — 순위 범위 내 무작위 1게임 추첨 오버레이.
// 전부 클라이언트 전용(수집·DB 무관): 후보는 현재 스냅샷 전체(화면 필터와 독립).
// 연출 = CS:GO 케이스 오프닝 스타일 수평 룰렛: 버블 벨트가 감속하며 중앙 니들에 안착
// (1단계 큰 감속 → 니어미스 지터 → 2단계 정확 안착 → 당첨 확대). JS가 transform
// transition을 2단계로 구동하고, 키프레임은 안착 팝(draw-pop)·결과 등장(draw-fadeup)만 사용.

const TILE = 72; // 벨트 타일(버블) 지름 px
const GAP = 12;
const PITCH = TILE + GAP;
const BELT_LEN = 48;
const WINNER_IDX = 40; // 당첨 타일 위치 — 앞 40개가 감속 구간의 구경거리
const STAGE1_MS = 3000; // 큰 감속 (니어미스 지점까지)
const STAGE2_MS = 450; // 정확 안착 되감기
const LAND_MS = 650; // 안착 후 당첨 확대·팝 감상 시간

// 희귀도 티어 — 뽑은 범위 내 상대 순위 백분위 (0 = 범위 내 최상위). CS:GO 레어리티 문법.
const TIERS = [
  { max: 0.05, color: "#e4ae39", gold: true }, // 금 (상위 5%)
  { max: 0.15, color: "#eb4b4b", gold: false }, // 레드 (Covert)
  { max: 0.3, color: "#d32ce6", gold: false }, // 핑크 (Classified)
  { max: 0.5, color: "#8847ff", gold: false }, // 퍼플 (Restricted)
  { max: 1.01, color: "#4b69ff", gold: false }, // 블루 (Mil-Spec)
] as const;

interface Tier {
  color: string;
  gold: boolean;
  topPct: number; // 표시용 "상위 n%" (최소 1)
}

function tierOf(rank: number, lo: number, hi: number): Tier {
  const pct = (rank - lo) / Math.max(1, hi - lo);
  const t = TIERS.find((tt) => pct <= tt.max) ?? TIERS[TIERS.length - 1];
  return { color: t.color, gold: t.gold, topPct: Math.max(1, Math.ceil(pct * 100)) };
}

type Phase = "setup" | "drawing" | "result";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 셔플 백을 순환시켜 벨트를 채움 (풀이 작으면 반복 등장 — 실제 케이스 벨트와 동일한 관용)
function buildBelt(pool: GameBubbleData[], winner: GameBubbleData): GameBubbleData[] {
  const arr: GameBubbleData[] = [];
  let bag: GameBubbleData[] = [];
  while (arr.length < BELT_LEN) {
    if (bag.length === 0) bag = shuffle(pool);
    arr.push(bag.pop()!);
  }
  arr[WINNER_IDX] = winner;
  return arr;
}

interface BubbleDrawProps {
  open: boolean;
  // 스냅샷 전체 (범위 필터는 여기서 자체 수행)
  games: GameBubbleData[];
  onClose: () => void;
  // 당첨작 상세 → 기존 GameModal 재사용 (호출 측에서 오버레이 닫고 모달 오픈)
  onViewDetail: (game: GameBubbleData) => void;
}

export default function BubbleDraw({
  open,
  games,
  onClose,
  onViewDetail,
}: BubbleDrawProps) {
  const t = useTranslations("draw");
  const tCommon = useTranslations("common");
  const tControls = useTranslations("controls");
  const tReview = useTranslations("reviewScore");
  const locale = useLocale() as Locale;
  const dialogRef = useRef<HTMLDivElement>(null);
  const beltBoxRef = useRef<HTMLDivElement>(null);
  const beltRef = useRef<HTMLDivElement>(null);

  const maxRank = useMemo(
    () => games.reduce((m, g) => Math.max(m, g.rank), 1),
    [games],
  );
  const [minSel, setMinSel] = useState(1);
  const [maxSel, setMaxSel] = useState(100);
  const [phase, setPhase] = useState<Phase>("setup");
  const [winner, setWinner] = useState<GameBubbleData | null>(null);
  const [belt, setBelt] = useState<GameBubbleData[]>([]);
  // 추첨 시점의 [lo, hi] — 이후 범위를 바꿔도 결과 티어는 뽑은 범위 기준 유지
  const [drawnRange, setDrawnRange] = useState<[number, number]>([1, 100]);
  const [landed, setLanded] = useState(false);

  // 입력 순서에 관대 — 뒤집혀 있어도 [lo, hi]로 정규화
  const lo = Math.min(minSel, maxSel);
  const hi = Math.max(minSel, maxSel);
  const candidates = useMemo(
    () => games.filter((g) => g.rank >= lo && g.rank <= hi),
    [games, lo, hi],
  );

  // 스크롤 잠금 + 포커스 이동 (GameModal과 동일 패턴)
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open]);

  // 닫힐 때: 추첨 중이었다면 초기 화면으로 되돌림 (타임라인 정리는 벨트 이펙트 cleanup 담당)
  useEffect(() => {
    if (open) return;
    setPhase((p) => (p === "drawing" ? "setup" : p));
  }, [open]);

  // 벨트 구동 — phase가 drawing이 될 때마다 2단계 transition 타임라인 실행.
  // 사용자가 명시적으로 요청한 일회성 연출이므로 prefers-reduced-motion과 무관하게 재생
  // (버블맵 본체도 상시 애니메이션 — 사이트 전체 관용과 일치)
  useEffect(() => {
    if (phase !== "drawing") return;
    const beltEl = beltRef.current;
    const box = beltBoxRef.current;
    if (!beltEl || !box) return;

    let cancelled = false;
    let stage = 1;
    // 당첨 타일 중심을 니들(컨테이너 중앙)에 맞추는 오프셋
    const exact = WINNER_IDX * PITCH + TILE / 2 - box.clientWidth / 2;
    // 니어미스: 1단계는 정답에서 살짝 어긋나게 멈췄다가 2단계에서 되감아 안착
    const jitter = (Math.random() * 0.64 - 0.32) * PITCH;

    beltEl.style.transition = "none";
    beltEl.style.transform = "translateX(0px)";
    // 강제 리플로우로 시작 위치를 커밋한 뒤 발진 — rAF 비의존이라 스로틀 환경에서도 확실
    void beltEl.offsetWidth;
    beltEl.style.transition = `transform ${STAGE1_MS}ms cubic-bezier(0.12,0.65,0.06,1)`;
    beltEl.style.transform = `translateX(${-(exact + jitter)}px)`;

    const onEnd = (e: TransitionEvent) => {
      if (cancelled || e.target !== beltEl || e.propertyName !== "transform")
        return;
      if (stage === 1) {
        stage = 2;
        beltEl.style.transition = `transform ${STAGE2_MS}ms cubic-bezier(0.22,1,0.36,1)`;
        beltEl.style.transform = `translateX(${-exact}px)`;
      } else if (stage === 2) {
        stage = 3;
        setLanded(true); // 당첨 타일 확대 + 팝 링
        window.setTimeout(() => {
          if (!cancelled) setPhase("result");
        }, LAND_MS);
      }
    };
    beltEl.addEventListener("transitionend", onEnd);
    // 백그라운드 탭 등 transitionend 미발화 대비 안전 타이머
    const safety = window.setTimeout(
      () => {
        if (!cancelled) setPhase("result");
      },
      STAGE1_MS + STAGE2_MS + LAND_MS + 900,
    );
    return () => {
      cancelled = true;
      beltEl.removeEventListener("transitionend", onEnd);
      window.clearTimeout(safety);
    };
  }, [phase]);

  if (!open) return null;

  const start = () => {
    if (candidates.length === 0) return;
    const w = candidates[Math.floor(Math.random() * candidates.length)];
    setWinner(w);
    setBelt(buildBelt(candidates, w));
    setDrawnRange([lo, hi]);
    setLanded(false);
    setPhase("drawing");
  };

  // 가벼운 포커스 트랩 (GameModal과 동일): Tab 순환 + ESC 닫기
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const rangeLabel = (r: RangeKey) =>
    r === "top100"
      ? tControls("rangeTop100")
      : tControls("rangeBand", { lo: RANGE_BOUNDS[r][0], hi: RANGE_BOUNDS[r][1] });

  // 프리셋: 전체 + 상위 5구간 + (deep 로드 시) 1,001~최대 묶음 칩.
  // 13구간 전부는 다이얼로그에 과밀 — 세밀한 구간은 커스텀 입력이 담당
  const presets: { key: string; label: string; bounds: [number, number] }[] = [
    { key: "all", label: t("all"), bounds: [1, maxRank] },
    ...RANGES.slice(0, 5).map((r: RangeKey) => ({
      key: r,
      label: rangeLabel(r),
      bounds: [
        RANGE_BOUNDS[r][0],
        Math.min(RANGE_BOUNDS[r][1], maxRank),
      ] as [number, number],
    })),
    ...(maxRank > TOP_SCOPE_MAX_RANK
      ? [
          {
            key: "deep",
            label: tControls("rangeBand", {
              lo: TOP_SCOPE_MAX_RANK + 1,
              hi: maxRank,
            }),
            bounds: [TOP_SCOPE_MAX_RANK + 1, maxRank] as [number, number],
          },
        ]
      : []),
  ];

  const clampRank = (v: number) =>
    Math.min(maxRank, Math.max(1, Math.round(v)));

  const winnerTier = winner
    ? tierOf(winner.rank, drawnRange[0], drawnRange[1])
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-800 bg-[#12121a] p-5 shadow-2xl focus:outline-none"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-neutral-100">{t("title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="shrink-0 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {phase === "setup" ? (
          <div>
            <p className="mb-4 text-xs text-neutral-500">{t("subtitle")}</p>
            <p className="mb-2 text-xs text-neutral-500">{t("rangeLabel")}</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const active = lo === p.bounds[0] && hi === p.bounds[1];
                return (
                  <button
                    key={p.key}
                    onClick={() => {
                      setMinSel(p.bounds[0]);
                      setMaxSel(p.bounds[1]);
                    }}
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1.5 text-xs whitespace-nowrap md:py-1 ${
                      active
                        ? "border-[#16c784]/60 bg-[#16c784]/10 text-[#16c784]"
                        : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mb-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={maxRank}
                value={minSel}
                aria-label={t("min")}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (!Number.isNaN(v)) setMinSel(clampRank(v));
                }}
                className="w-24 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-neutral-600 focus:outline-none"
              />
              <span className="text-neutral-600">~</span>
              <input
                type="number"
                min={1}
                max={maxRank}
                value={maxSel}
                aria-label={t("max")}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (!Number.isNaN(v)) setMaxSel(clampRank(v));
                }}
                className="w-24 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-neutral-600 focus:outline-none"
              />
            </div>
            <p
              className={`text-xs ${
                candidates.length === 0 ? "text-[#ea3943]" : "text-neutral-500"
              }`}
            >
              {candidates.length === 0
                ? t("noCandidates")
                : t("candidates", { count: candidates.length })}
            </p>
            <button
              onClick={start}
              disabled={candidates.length === 0}
              className="mt-5 w-full rounded-lg bg-[#16c784] px-4 py-3 text-base font-bold text-[#0a0a0f] transition-colors hover:bg-[#13b176] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("cta")}
            </button>
          </div>
        ) : (
          winner &&
          winnerTier && (
            <div className="flex flex-col items-center">
              {phase === "drawing" ? (
                <>
                  {/* 케이스 오프닝 벨트 — overflow 상자 + 중앙 니들 + 양끝 페이드 */}
                  <div
                    ref={beltBoxRef}
                    className="relative h-[104px] w-full overflow-hidden rounded-lg border border-neutral-800 bg-[#0a0a0f]"
                  >
                    <div
                      ref={beltRef}
                      className="absolute left-0 top-4 flex will-change-transform"
                      style={{ gap: GAP }}
                    >
                      {belt.map((g, i) => {
                        const tileTier = tierOf(
                          g.rank,
                          drawnRange[0],
                          drawnRange[1],
                        );
                        const isWinnerTile = landed && i === WINNER_IDX;
                        return (
                          <div
                            key={`${i}-${g.appid}`}
                            className="relative shrink-0"
                            style={{ width: TILE, height: TILE }}
                          >
                            <div
                              className={`h-full w-full rounded-full transition-transform duration-300 ${
                                isWinnerTile ? "scale-110" : ""
                              }`}
                              style={{
                                boxShadow: isWinnerTile
                                  ? `0 0 0 3px ${tileTier.color}, 0 0 26px ${tileTier.color}aa`
                                  : `0 0 0 2px ${tileTier.color}55`,
                              }}
                            >
                              <BubbleArt game={g} className="h-full w-full" />
                            </div>
                            {isWinnerTile && (
                              <div
                                className="pointer-events-none absolute inset-0 animate-[draw-pop_0.5s_ease-out_forwards] rounded-full"
                                style={{ border: `2px solid ${tileTier.color}` }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 양끝 페이드 */}
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-[#0a0a0f] to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[#0a0a0f] to-transparent" />
                    {/* 중앙 니들 */}
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#16c784]/80" />
                    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#16c784]" />
                    <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 border-x-[5px] border-b-[6px] border-x-transparent border-b-[#16c784]" />
                  </div>
                  <p className="mt-3 animate-pulse text-sm text-neutral-400">
                    {t("drawing")}
                  </p>
                </>
              ) : (
                <div className="mt-1 w-full animate-[draw-fadeup_0.35s_ease-out_both] text-center">
                  <div className="mb-3 flex justify-center pt-2">
                    <WinnerBubble game={winner} tierColor={winnerTier.color} />
                  </div>
                  <p className="text-xs font-medium tracking-wide text-[#16c784]">
                    {t("resultTitle")}
                  </p>
                  {/* 희귀도 티어 — 뽑은 범위 내 상대 순위 백분위 */}
                  <p
                    className="mt-0.5 text-[11px] font-bold"
                    style={{ color: winnerTier.color }}
                  >
                    {winnerTier.gold ? "★ " : ""}
                    {t("tierTop", { pct: winnerTier.topPct })}
                  </p>
                  <h3 className="mt-0.5 text-xl font-bold text-neutral-100">
                    {winner.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {t("stats", { players: winner.players, rank: winner.rank })}
                  </p>
                  <p className="mt-1.5 flex items-baseline justify-center gap-2 text-sm">
                    <span className={reviewColor(winner.reviewScore)}>
                      {tReview(String(winner.reviewScore))}
                    </span>
                    <span className="text-neutral-600">·</span>
                    {winner.isFree ? (
                      <span className="font-semibold text-neutral-200">
                        {tCommon("free")}
                      </span>
                    ) : winner.price ? (
                      <span className="flex items-baseline gap-1.5">
                        {winner.price.discountPct > 0 && (
                          <span className="text-xs text-neutral-500 line-through">
                            {formatPrice(
                              { ...winner.price, final: winner.price.initial },
                              locale,
                            )}
                          </span>
                        )}
                        <span className="font-semibold text-neutral-200">
                          {formatPrice(winner.price, locale)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-neutral-500">
                        {tCommon("priceUnavailable")}
                      </span>
                    )}
                  </p>
                  <p className="sr-only">
                    {formatPlayersFull(winner.players, locale)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => setPhase("setup")}
                      className="rounded-md border border-neutral-800 px-3 py-2 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                    >
                      {t("changeRange")}
                    </button>
                    <button
                      onClick={start}
                      className="rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                    >
                      {t("again")}
                    </button>
                    <button
                      onClick={() => onViewDetail(winner)}
                      className="rounded-md bg-[#16c784]/15 px-3 py-2 text-xs font-semibold text-[#16c784] hover:bg-[#16c784]/25"
                    >
                      {t("viewDetail")} →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function reviewColor(score: number): string {
  if (score === 0) return "text-neutral-500";
  if (score >= 8) return "text-[#16c784]";
  if (score >= 5) return "text-[#fbbf24]";
  return "text-[#ea3943]";
}

// 원형 크롭 게임 아트 — 이미지 없음/로드 실패 시 이니셜 폴백.
// 외곽 링은 호출 측이 티어 색으로 그리므로 여기서는 아트만 담당한다.
function BubbleArt({
  game,
  className,
}: {
  game: GameBubbleData;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  if (game.headerImage && !err) {
    return (
      // 스팀 CDN 썸네일 — 작은 장식 이미지
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={game.headerImage}
        alt=""
        draggable={false}
        onError={() => setErr(true)}
        className={`rounded-full object-cover ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-neutral-800 text-lg font-bold text-neutral-400 ${className ?? ""}`}
    >
      {game.name.slice(0, 1)}
    </div>
  );
}

// 당첨 버블 — 희귀도 티어 색 링 + 글로우, 할인 시 노란 외곽 링 + 뱃지 (버블맵 문법 유지)
function WinnerBubble({
  game,
  tierColor,
}: {
  game: GameBubbleData;
  tierColor: string;
}) {
  const discountPct = game.price?.discountPct ?? 0;
  return (
    <div className="relative">
      <div
        className="rounded-full"
        style={{
          border: `3px solid ${tierColor}`,
          boxShadow: `0 0 44px ${tierColor}66`,
          ...(discountPct > 0
            ? { outline: "3px solid #fbbf24", outlineOffset: "3px" }
            : {}),
        }}
      >
        <BubbleArt game={game} className="h-32 w-32" />
      </div>
      {discountPct > 0 && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-[#fbbf24] px-2 py-0.5 text-xs font-bold text-[#14161f]">
          -{discountPct}%
        </span>
      )}
    </div>
  );
}
