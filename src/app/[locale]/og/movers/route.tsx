import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import {
  ALL_LOCALES,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import { getBubbleSnapshot } from "@/lib/data";
import { formatChangePct, formatPlayersFull } from "@/lib/format";
import { topMovers } from "@/lib/movers";
import type { Period } from "@/lib/types";

// "오늘의 급상승" 공유 이미지 (CLAUDE.md 5-1 확장) — 급상승 TOP 7 리더보드 1200×630.
// satori 한글 임베딩 불안정 → 이미지 텍스트는 Latin(nameEn·숫자·브랜드). X/Threads 유입 루프용.

export const runtime = "nodejs";
const SIZE = { width: 1200, height: 630 };

const GREEN = "#16c784";
const MUTED = "#8b96a5";

function toLocale(raw: string): Locale {
  return hasLocale(ALL_LOCALES, raw) ? (raw as Locale) : DEFAULT_LOCALE;
}
function toPeriod(raw: string | null): Period {
  return raw === "7d" || raw === "30d" ? raw : "24h";
}

function Logo() {
  return (
    <svg width="52" height="52" viewBox="0 0 48 48">
      <circle cx="18" cy="21" r="13" fill={GREEN} opacity="0.92" />
      <circle cx="33" cy="17" r="9" fill="#2dd4bf" opacity="0.9" />
      <circle cx="29" cy="33" r="7" fill="#38bdf8" opacity="0.85" />
    </svg>
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  const period = toPeriod(new URL(req.url).searchParams.get("period"));

  let top: { name: string; players: number; changePct: number }[] = [];
  try {
    const snap = await getBubbleSnapshot({
      period,
      currency: DEFAULT_CURRENCY[locale],
      locale,
    });
    top = topMovers(snap.games, "up", 7).map((g) => ({
      name: g.nameEn || g.name || `#${g.appid}`,
      players: g.players,
      changePct: g.changePct ?? 0,
    }));
  } catch {
    top = []; // DB 일시 오류 — 브랜드 카드만 (우아한 강등)
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "radial-gradient(120% 120% at 50% 0%, #15151f 0%, #0a0a0f 60%)",
          color: "#ffffff",
          padding: "32px 52px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo />
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>
              steambubbles
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>
              📈 TOP GAINERS
            </div>
            <div style={{ fontSize: 18, color: MUTED, marginTop: 2 }}>
              {`Rising on Steam · ${period}`}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: 20,
          }}
        >
          {top.length === 0 ? (
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                color: MUTED,
              }}
            >
              Fastest-rising Steam games, in bubbles
            </div>
          ) : (
            top.map((g, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #1e1e2a",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 118,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(22,199,132,0.14)",
                    color: GREEN,
                    fontSize: 24,
                    fontWeight: 800,
                    marginRight: 22,
                    padding: "0 12px",
                  }}
                >
                  {formatChangePct(g.changePct)}
                </div>
                <div
                  style={{
                    flex: 1,
                    fontSize: 30,
                    fontWeight: 600,
                    color: "#f1f3f5",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.name}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#ffffff",
                    marginLeft: 20,
                  }}
                >
                  {formatPlayersFull(g.players, "en")}
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 20, color: MUTED }}>
            Concurrent players × discounts, at a glance
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: GREEN }}>
            steambubbles.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: {
        "cache-control":
          "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}
