import { Texture } from "pixi.js";

// 게임 아트 텍스처 로더 — appid별 캐시 + 동시 로드 제한 큐 + 이니셜 폴백.
// 캐시는 모듈 스코프: prop 갱신·엔진 재마운트에도 유지 (엔진 destroy는 texture: false).

const TEX_SIZE = 192;
const MAX_CONCURRENT = 8;

const cache = new Map<number, Texture>();
const inflight = new Map<number, Promise<Texture>>();

// ── 동시 로드 세마포어: 300 버블이 요청을 한꺼번에 쏘지 않도록 8개로 제한 ──
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

// 동일 출처 Next 이미지 프록시 경유 — 캔버스 CORS taint 회피
// (원본 CDN 도메인은 next.config images.remotePatterns에 등록되어 있어야 함)
function proxyUrl(src: string): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=256&q=70`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

// cover-fit 원형 크롭 캔버스 → 텍스처. 런타임 마스크 비용 없이 알파로 원형 확보
function circleCrop(img: HTMLImageElement): Texture | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const half = TEX_SIZE / 2;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.clip();
  const scale = TEX_SIZE / Math.min(w, h);
  ctx.drawImage(img, half - (w * scale) / 2, half - (h * scale) / 2, w * scale, h * scale);
  return Texture.from(canvas);
}

// 폴백 — appid 고정 색상 원 + 게임명 앞 2글자
function initialsTexture(appid: number, name: string): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  const half = TEX_SIZE / 2;
  const hue = Math.round((appid * 137.508) % 360);
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hue} 42% 30%)`;
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = `700 ${Math.round(TEX_SIZE * 0.32)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.trim().slice(0, 2).toUpperCase(), half, half + TEX_SIZE * 0.02);
  return Texture.from(canvas);
}

// 항상 resolve — 이미지 실패 시 이니셜 텍스처로 대체 (reject 없음).
// 성공한 크롭만 캐시한다: 이니셜 폴백을 캐시하면 details 크론이 나중에 header_image를
// 채워도 세션 내내 이니셜이 고정된다 (headerImage null→URL 전환은 forceReload로 재요청).
export function loadBubbleTexture(
  appid: number,
  headerImage: string | null,
  name: string,
  forceReload = false,
): Promise<Texture> {
  if (!forceReload) {
    const cached = cache.get(appid);
    if (cached) return Promise.resolve(cached);
    const pending = inflight.get(appid);
    if (pending) return pending;
  }
  const task = (async () => {
    let tex: Texture | null = null;
    if (headerImage) {
      await acquire();
      try {
        tex = circleCrop(await loadImage(proxyUrl(headerImage)));
      } catch {
        tex = null; // 404/차단 → 이니셜 폴백
      } finally {
        release();
      }
    }
    inflight.delete(appid);
    if (tex) {
      cache.set(appid, tex); // 성공만 캐시
      return tex;
    }
    return initialsTexture(appid, name); // 폴백은 캐시하지 않음 → 이후 재요청 가능
  })();
  if (!forceReload) inflight.set(appid, task);
  return task;
}
