// 버블맵 튜닝 상수 (CLAUDE.md 5-1 — cryptobubbles 시각 문법)

// ── 반경: sqrt 스케일 (선형 금지) ──
export const MIN_RADIUS = 8;
// maxR = min(뷰포트 w, h) / MAX_RADIUS_DIVISOR
export const MAX_RADIUS_DIVISOR = 6.5;
export const COLLIDE_PADDING = 1.5;
// 시각 반경이 목표 반경으로 수렴하는 프레임당 lerp 계수
export const RADIUS_LERP = 0.14;

// ── d3-force: 약한 중심력 + 상시 미세 요동 ──
export const CENTER_STRENGTH = 0.03;
export const VELOCITY_DECAY = 0.3;
export const JITTER_STRENGTH = 0.18;
// 평시 알파 — 0이면 정지하므로 유동감 유지용 소값
export const ALPHA_IDLE = 0.06;
// 노드 증감/반경 변경 시 재가열 알파 (ALPHA_COOL 계수로 IDLE까지 냉각)
export const ALPHA_REHEAT = 0.35;
export const ALPHA_COOL = 0.03;

// ── LOD: 크기별 버블 내용물 표시 임계 반경 ──
export const LOD_NAME_MIN_R = 30; // 이름
export const LOD_COUNT_MIN_R = 20; // 현재 동접 수 (핵심 지표)
export const LOD_RANK_MIN_R = 40; // 순위 #N (큰 버블만)

// ── 인터랙션 ──
export const HOVER_SCALE = 1.07;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
// 누적 이동이 이 픽셀을 넘으면 팬 제스처 — 탭(onSelect) 억제
export const PAN_THRESHOLD = 6;
