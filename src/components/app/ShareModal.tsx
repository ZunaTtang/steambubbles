"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { GameBubbleData } from "@/lib/types";
import {
  canCopyImage,
  canShareFiles,
  cardToPngBlob,
  copyPngBlob,
  downloadBlob,
  pngFile,
  shareFile,
} from "@/lib/capture";
import ShareCard, { type ShareTopEntry } from "./ShareCard";

type Phase = "generating" | "ready" | "error";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  // 현재 뷰포트를 PNG data URL로 (엔진 Pixi extract). null = 실패
  capture: (resolution?: number) => Promise<string | null>;
  games: GameBubbleData[]; // 현재 필터된 목록 — Top3·메타 산출
  rangeLabel: string;
  periodLabel: string;
  updatedTime: string;
}

export default function ShareModal({
  open,
  onClose,
  capture,
  games,
  rangeLabel,
  periodLabel,
  updatedTime,
}: ShareModalProps) {
  const t = useTranslations("share");
  const tSite = useTranslations("site");
  const locale = useLocale() as Locale;

  const cardRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(0); // 진행 중 파이프라인 토큰 (StrictMode 이중 실행·재생성 무효화)
  const previewRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("generating");
  const [bubbleUrl, setBubbleUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);

  const setPreview = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }, []);

  const top: ShareTopEntry[] = useMemo(
    () =>
      [...games]
        .sort((a, b) => b.players - a.players)
        .slice(0, 3)
        .map((g) => ({
          rank: g.rank,
          name: g.name,
          players: g.players,
          changePct: g.changePct,
        })),
    [games],
  );

  const watermark = useMemo(() => {
    if (typeof window === "undefined") return "steambubbles.vercel.app";
    return window.location.hostname.replace(/^www\./, "");
  }, []);

  const metaLine = `${periodLabel} · ${t("asOf", { time: updatedTime })}`;

  // 열릴 때: 뷰포트 캡처 → 카드에 심음(→ 히어로 onLoad가 snapdom 트리거)
  useEffect(() => {
    if (!open) return;
    const token = ++runRef.current;
    setPhase("generating");
    setBlob(null);
    setCopied(false);
    setPreview(null);
    setBubbleUrl(null);
    (async () => {
      const url = await capture(2);
      if (token !== runRef.current) return;
      if (!url) {
        setPhase("error");
        return;
      }
      setBubbleUrl(url);
    })();
  }, [open, capture, setPreview]);

  // 닫힐 때: 진행 무효화 + 리소스 해제
  useEffect(() => {
    if (open) return;
    runRef.current++;
    setBubbleUrl(null);
    setBlob(null);
    setPreview(null);
  }, [open, setPreview]);

  // 언마운트 시 objectURL 정리
  useEffect(() => () => setPreview(null), [setPreview]);

  // 카드의 히어로 이미지 로드 완료 → snapdom으로 최종 PNG 생성
  const handleHeroLoad = useCallback(async () => {
    const token = runRef.current;
    const el = cardRef.current;
    if (!el) return;
    try {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* 폰트 준비 대기는 베스트에포트 */
        }
      }
      const out = await cardToPngBlob(el);
      if (token !== runRef.current) return;
      setBlob(out);
      setPreview(URL.createObjectURL(out));
      setPhase("ready");
    } catch {
      if (token === runRef.current) setPhase("error");
    }
  }, [setPreview]);

  const file = useMemo(
    () => (blob ? pngFile(blob, "steambubbles-bubblemap.png") : null),
    [blob],
  );
  const showShare = file ? canShareFiles(file) : false;
  const showCopy = canCopyImage();

  const onDownload = useCallback(() => {
    if (blob) downloadBlob(blob, "steambubbles-bubblemap.png");
  }, [blob]);

  const onShare = useCallback(() => {
    if (file) {
      void shareFile(file, {
        title: tSite("title"),
        text: t("shareText"),
      });
    }
  }, [file, t, tSite]);

  const onCopy = useCallback(async () => {
    if (!blob) return;
    const ok = await copyPngBlob(blob);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [blob]);

  // Esc 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 캡처 대상 카드 — 화면 밖에 실제 레이아웃으로 배치(display:none이면 캡처 불가) */}
      {bubbleUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -100000,
            top: 0,
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          <div ref={cardRef}>
            <ShareCard
              bubbleUrl={bubbleUrl}
              title={tSite("title")}
              tagline={t("tagline")}
              rangeLabel={rangeLabel}
              metaLine={metaLine}
              watermark={watermark}
              top={top}
              locale={locale}
              onBubbleLoad={handleHeroLoad}
            />
          </div>
        </div>
      )}

      {/* 표시 모달 */}
      <div
        className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="anim-modal w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-800 bg-[#12121a] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-200">
              {t("title")}
            </h2>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="rounded p-1 text-neutral-500 hover:text-neutral-200"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="p-4">
            <div className="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-[#0a0a0f]" style={{ aspectRatio: "1200 / 675" }}>
              {phase === "ready" && previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : phase === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <p className="text-sm text-neutral-400">{t("error")}</p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[#16c784]" />
                  <span className="text-sm">{t("generating")}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {phase === "error" ? (
                <button
                  onClick={() => {
                    // 재시도 — open 파이프라인 재실행
                    const token = ++runRef.current;
                    setPhase("generating");
                    setBlob(null);
                    setPreview(null);
                    setBubbleUrl(null);
                    void capture(2).then((url) => {
                      if (token !== runRef.current) return;
                      if (!url) setPhase("error");
                      else setBubbleUrl(url);
                    });
                  }}
                  className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 active:scale-[0.98]"
                >
                  {t("retry")}
                </button>
              ) : (
                <>
                  {showCopy && (
                    <button
                      onClick={onCopy}
                      disabled={phase !== "ready"}
                      className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 active:scale-[0.98] disabled:opacity-40"
                    >
                      {copied ? t("copied") : t("copy")}
                    </button>
                  )}
                  {showShare && (
                    <button
                      onClick={onShare}
                      disabled={phase !== "ready"}
                      className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 active:scale-[0.98] disabled:opacity-40"
                    >
                      {t("share")}
                    </button>
                  )}
                  <button
                    onClick={onDownload}
                    disabled={phase !== "ready"}
                    className="rounded-md bg-[#16c784] px-3.5 py-2 text-sm font-semibold text-[#052e1c] transition hover:bg-[#13b676] active:scale-[0.98] disabled:opacity-40"
                  >
                    {t("download")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
