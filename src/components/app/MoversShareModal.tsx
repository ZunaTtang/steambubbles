"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import type { Period } from "@/lib/types";
import {
  canCopyImage,
  canShareFiles,
  copyPngBlob,
  downloadBlob,
  pngFile,
  shareFile,
} from "@/lib/capture";

// 떡상(급상승) 공유 — 서버 /og/movers PNG를 미리보기로 띄우고 다운로드/공유/복사 제공.
// 버블맵 ShareModal과 UX를 맞추되, 이미지는 캡처가 아니라 서버 라우트에서 받아온다.

type Phase = "loading" | "ready" | "error";

const FILE_NAME = "steambubbles-movers.png";

interface MoversShareModalProps {
  open: boolean;
  onClose: () => void;
  period: Period;
}

export default function MoversShareModal({
  open,
  onClose,
  period,
}: MoversShareModalProps) {
  const t = useTranslations("share");
  const tm = useTranslations("movers");
  const locale = useLocale() as Locale;

  const runRef = useRef(0); // 진행 중 요청 토큰 (재열기·기간 변경 시 이전 요청 무효화)
  const previewRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);

  const setPreview = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }, []);

  const load = useCallback(async () => {
    const token = ++runRef.current;
    setPhase("loading");
    setBlob(null);
    setCopied(false);
    setPreview(null);
    try {
      const res = await fetch(`/${locale}/og/movers?period=${period}`);
      if (!res.ok) throw new Error(String(res.status));
      const out = await res.blob();
      if (token !== runRef.current) return; // 무효화됨
      setBlob(out);
      setPreview(URL.createObjectURL(out));
      setPhase("ready");
    } catch {
      if (token === runRef.current) setPhase("error");
    }
  }, [locale, period, setPreview]);

  // 열릴 때 생성, 닫힐 때 정리
  useEffect(() => {
    if (open) {
      void load();
    } else {
      runRef.current++;
      setBlob(null);
      setPreview(null);
    }
  }, [open, load, setPreview]);

  // 언마운트 시 objectURL 해제
  useEffect(() => () => setPreview(null), [setPreview]);

  // Esc 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const file = blob ? pngFile(blob, FILE_NAME) : null;
  const showShare = file ? canShareFiles(file) : false;
  const showCopy = canCopyImage();

  const onDownload = useCallback(() => {
    if (blob) downloadBlob(blob, FILE_NAME);
  }, [blob]);

  const onShare = useCallback(() => {
    if (file) {
      void shareFile(file, {
        title: tm("shareTitle"),
        text: tm("shareText"),
      });
    }
  }, [file, tm]);

  const onCopy = useCallback(async () => {
    if (!blob) return;
    const ok = await copyPngBlob(blob);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [blob]);

  if (!open) return null;

  return (
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
            {tm("shareTitle")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="rounded p-1 text-neutral-500 hover:text-neutral-200"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
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
          <div
            className="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-[#0a0a0f]"
            style={{ aspectRatio: "1200 / 630" }}
          >
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
                onClick={() => void load()}
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
  );
}
