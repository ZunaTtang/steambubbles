import type { Locale } from "@/i18n/locales";
import Logo from "@/components/Logo";

// 공유용 브랜드 카드 (1200×675) — snapdom 캡처 대상.
// 색상은 전부 명시 hex(Tailwind v4 oklch가 캡처에서 어긋나는 것 방지),
// 폰트는 시스템 스택 고정(한글 글리프 보장 + Geist 임베드 의존 제거).

const GREEN = "#16c784";
const RED = "#ea3943";
const MUTED = "#8b96a5";
const PANEL = "#12121a";
const BORDER = "#242433";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Roboto, sans-serif';

export interface ShareTopEntry {
  rank: number;
  name: string;
  players: number;
  changePct: number | null;
}

interface ShareCardProps {
  bubbleUrl: string;
  title: string;
  tagline: string;
  rangeLabel: string;
  metaLine: string;
  watermark: string;
  top: ShareTopEntry[];
  locale: Locale;
  onBubbleLoad?: () => void;
}

export default function ShareCard({
  bubbleUrl,
  title,
  tagline,
  rangeLabel,
  metaLine,
  watermark,
  top,
  locale,
  onBubbleLoad,
}: ShareCardProps) {
  return (
    <div
      style={{
        width: 1200,
        height: 675,
        fontFamily: FONT_STACK,
        background:
          "radial-gradient(120% 120% at 50% 0%, #15151f 0%, #0a0a0f 60%)",
        color: "#ffffff",
      }}
      className="relative flex flex-col overflow-hidden"
    >
      {/* 상단 브랜드 액센트 라인 */}
      <div
        style={{
          height: 4,
          background: `linear-gradient(90deg, ${GREEN}, #2dd4bf, #38bdf8)`,
        }}
      />

      {/* 헤더: 브랜드 / 범위·메타 */}
      <header className="flex items-center justify-between px-10 pt-7 pb-5">
        <div className="flex items-center gap-3.5">
          <Logo size={46} />
          <div>
            <div
              style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.01em" }}
            >
              {title}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
              {tagline}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 15,
              fontWeight: 700,
              color: GREEN,
              background: "rgba(22,199,132,0.12)",
              border: "1px solid rgba(22,199,132,0.32)",
              borderRadius: 999,
              padding: "4px 14px",
            }}
          >
            {rangeLabel}
          </span>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 7 }}>
            {metaLine}
          </div>
        </div>
      </header>

      {/* 히어로: 버블맵 이미지 + 워터마크 */}
      <div
        className="relative mx-10 overflow-hidden"
        style={{
          flex: 1,
          borderRadius: 18,
          background: "#0d0d14",
          border: `1px solid ${BORDER}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bubbleUrl}
          alt=""
          onLoad={onBubbleLoad}
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
        {/* 워터마크 — 히어로에 직접 얹어 이미지를 잘라도 함께 남게 (CLAUDE.md 5-4 우측 하단) */}
        <div
          className="absolute flex items-center gap-1.5"
          style={{
            right: 14,
            bottom: 14,
            background: "rgba(10,10,15,0.82)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: "6px 12px 6px 10px",
          }}
        >
          <Logo size={18} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e6e9ee" }}>
            {watermark}
          </span>
        </div>
      </div>

      {/* 푸터: 동접 상위 3 */}
      <footer className="flex items-stretch gap-3 px-10 pt-5 pb-7">
        {top.slice(0, 3).map((g, i) => {
          const changeColor =
            g.changePct === null ? MUTED : g.changePct >= 0 ? GREEN : RED;
          const changeText =
            g.changePct === null
              ? null
              : `${g.changePct > 0 ? "+" : ""}${g.changePct.toFixed(1)}%`;
          return (
            <div
              key={g.rank}
              className="flex min-w-0 flex-1 items-center gap-3"
              style={{
                background: PANEL,
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                padding: "11px 16px",
              }}
            >
              <span
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: "rgba(22,199,132,0.14)",
                  color: GREEN,
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate"
                  style={{ fontSize: 15, fontWeight: 600, color: "#f1f3f5" }}
                >
                  {g.name}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
                  {new Intl.NumberFormat(locale).format(g.players)}
                </div>
              </div>
              {changeText && (
                <span
                  className="shrink-0"
                  style={{ fontSize: 13, fontWeight: 700, color: changeColor }}
                >
                  {changeText}
                </span>
              )}
            </div>
          );
        })}
      </footer>
    </div>
  );
}
