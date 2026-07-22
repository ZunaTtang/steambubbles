import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import {
  ALL_LOCALES,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  type Locale,
} from "@/i18n/locales";
import { getBubbleSnapshot } from "@/lib/data";
import { formatPlayersFull } from "@/lib/format";

// 동적 OG 이미지 (CLAUDE.md 5-4) — top 8 동접 리더보드 1200×630.
// satori는 한글 폰트 임베딩이 불안정하므로 이미지 텍스트는 Latin(게임 nameEn·숫자·브랜드)로
// 안정 렌더한다. 로케일별 title/description 메타 태그는 홈 페이지 generateMetadata가 담당.

export const runtime = "nodejs";
const SIZE = { width: 1200, height: 630 };

const GREEN = "#16c784";
const MUTED = "#8b96a5";

function toLocale(raw: string): Locale {
  return hasLocale(ALL_LOCALES, raw) ? (raw as Locale) : DEFAULT_LOCALE;
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
  _req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);

  let top: { rank: number; name: string; players: number }[] = [];
  try {
    const snap = await getBubbleSnapshot({
      period: "24h",
      currency: DEFAULT_CURRENCY[locale],
      locale,
    });
    top = snap.games.slice(0, 7).map((g) => ({
      rank: g.rank,
      name: g.nameEn || g.name || `#${g.appid}`,
      players: g.players,
    }));
  } catch {
    top = []; // DB 일시 오류 — 브랜드 카드만 렌더 (우아한 강등)
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
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo />
            <div
              style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}
            >
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
              LIVE PLAYERS
            </div>
            <div style={{ fontSize: 18, color: MUTED, marginTop: 2 }}>
              Top on Steam · 24h
            </div>
          </div>
        </div>

        {/* 리더보드 */}
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
              Live Steam concurrent players, in bubbles
            </div>
          ) : (
            top.map((g, i) => (
              <div
                key={g.rank}
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
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: i === 0 ? GREEN : "rgba(22,199,132,0.14)",
                    color: i === 0 ? "#052e1c" : GREEN,
                    fontSize: 22,
                    fontWeight: 800,
                    marginRight: 22,
                  }}
                >
                  {g.rank}
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
                    fontSize: 30,
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

        {/* 푸터 */}
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
