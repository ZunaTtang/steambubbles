import { ImageResponse } from "next/og";

// 파비콘 — Google 검색 결과 아이콘용 PNG. 래스터가 SVG보다 크롤러 인식이 안정적이라
// 기존 icon.svg를 대체(구글 SERP의 Vercel 삼각형 잔상 교체 목적).
// 브랜드 버블 3원(로고와 동일 색). 퍼센트 좌표 → 해상도 독립.
export const size = { width: 96, height: 96 };
export const contentType = "image/png";

const dot = (color: string, d: string, left: string, top: string) => ({
  position: "absolute" as const,
  width: d,
  height: d,
  left,
  top,
  borderRadius: "50%",
  background: color,
});

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#0b0b12",
          borderRadius: "23%",
        }}
      >
        <div style={dot("#16c784", "58.3%", "10.4%", "25%")} />
        <div style={dot("#2dd4bf", "41.7%", "45.8%", "16.7%")} />
        <div style={dot("#38bdf8", "31.3%", "47.9%", "56.3%")} />
      </div>
    ),
    { ...size },
  );
}
