// 브랜드 로고 — 버블 클러스터(3원). OG·공유 카드·상단 바가 공유하는 시각 정체성.
// 순수 SVG(고정 색)라 DOM·snapdom 어디서든 안전. 인라인 텍스트 옆 아이콘용.
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <circle cx="18" cy="21" r="13" fill="#16c784" opacity="0.92" />
      <circle cx="33" cy="17" r="9" fill="#2dd4bf" opacity="0.9" />
      <circle cx="29" cy="33" r="7" fill="#38bdf8" opacity="0.85" />
    </svg>
  );
}
