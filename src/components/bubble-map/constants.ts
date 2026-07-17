// 버블맵 튜닝 상수 (CLAUDE.md 5-1 — cryptobubbles 시각 문법)

// ── 반경: sqrt 스케일 (선형 금지) ──
export const MIN_RADIUS = 8;
// maxR = min(뷰포트 w, h) / MAX_RADIUS_DIVISOR
export const MAX_RADIUS_DIVISOR = 6.5;
export const COLLIDE_PADDING = 1.5;
// 시각 반경이 목표 반경으로 수렴하는 프레임당 lerp 계수
export const RADIUS_LERP = 0.14;
// ── 면적 예산: Σπr²이 뷰포트 면적 × FILL을 넘으면 전체 반경 균등 축소(비율 보존) ──
// 기존 maxR은 ~100-300노드 기준 튜닝이라 노드 수가 늘면 팩킹이 뷰포트를 넘쳐 사방으로 퍼짐
export const BUBBLE_AREA_FILL = 0.55;
// 균등 축소 후 반경 하한 (줌인하면 다시 커지므로 화면 노이즈만 방지)
export const RADIUS_FLOOR = 3;

// ── d3-force: 약한 중심력 + 상시 미세 요동 ──
export const CENTER_STRENGTH = 0.03;
export const VELOCITY_DECAY = 0.3;
export const JITTER_STRENGTH = 0.18;
// 평시 알파 — 0이면 정지하므로 유동감 유지용 소값
export const ALPHA_IDLE = 0.06;
// 노드 증감/반경 변경 시 재가열 알파 (ALPHA_COOL 계수로 IDLE까지 냉각)
export const ALPHA_REHEAT = 0.35;
export const ALPHA_COOL = 0.03;

// ── LOD: 버블 내용물 표시 임계 — **화면상 반경(월드 r × 줌)** 기준 (semantic zoom) ──
// 월드 반경 기준이면 줌인해도 이름이 영영 안 나타난다 (딥 랭크 가독성 핵심)
export const LOD_NAME_MIN_R = 26; // 이름
export const LOD_COUNT_MIN_R = 20; // 현재 동접 수 (핵심 지표)
export const LOD_RANK_MIN_R = 36; // 순위 #N (큰 버블만)
// 줌이 이 비율 이상 변했을 때만 LOD 재평가 + 텍스트 재래스터 (핀치 중 매 프레임 재래스터 방지)
export const LOD_ZOOM_STEP = 0.12;

// ── 인터랙션 ──
export const HOVER_SCALE = 1.07;
export const ZOOM_MIN = 0.5;
// 면적 예산 축소 후 최소 버블(r≈3~8)도 줌인으로 이름 임계(26px)에 닿아야 함 → 상한 5
export const ZOOM_MAX = 5;
// 누적 이동이 이 픽셀을 넘으면 팬 제스처 — 탭(onSelect) 억제
export const PAN_THRESHOLD = 6;
// 터치는 접촉 면적·미세 떨림이 커서 임계값을 높인다 (탭이 팬으로 오인되어 씹히는 것 방지)
export const PAN_THRESHOLD_TOUCH = 12;
// 터치 버블 드래그는 롱프레스로 인게이지 — 밀집 뷰에서 팬을 잡아먹지 않으면서 드래그 공존
// (짧은 스와이프=팬 / 탭=모달 / 꾹 누르고 이동=버블 드래그)
export const LONG_PRESS_MS = 280;
