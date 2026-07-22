// 공유 이미지 파이프라인 (CLAUDE.md 5-4)
// 버블맵은 PixiJS(WebGL) 캔버스라 snapdom이 라이브로 못 읽는다 → 엔진이 Pixi extract로
// 뜬 PNG를 카드 DOM의 <img>에 심고, 그 카드를 snapdom으로 최종 PNG화한다.

const CARD_BG = "#0a0a0f";

// 공유 카드 DOM → PNG Blob. scale 2 · dpr 1 = 화면 배율과 무관한 결정론적 2배 출력(2400×1350).
// snapdom(~40kB)은 첫 공유 시점에만 동적 로드해 초기 번들에서 제외한다.
export async function cardToPngBlob(el: HTMLElement): Promise<Blob> {
  const { snapdom } = await import("@zumer/snapdom");
  return snapdom.toBlob(el, {
    type: "png",
    backgroundColor: CARD_BG,
    scale: 2,
    dpr: 1,
    embedFonts: true,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 즉시 revoke하면 일부 브라우저에서 다운로드가 취소됨 — 다음 tick에 해제
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pngFile(blob: Blob, name = "steambubbles.png"): File {
  return new File([blob], name, { type: "image/png" });
}

// Web Share (파일) 지원 여부 — 주로 모바일. 데스크톱은 대개 미지원 → 버튼 숨김
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

// OS 공유 시트를 연다(전송 대상·확정은 사용자 몫). 성공/취소·미지원 모두 boolean, throw 없음
export async function shareFile(
  file: File,
  data: { title?: string; text?: string },
): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: data.title, text: data.text });
    return true;
  } catch {
    return false; // 사용자 취소(AbortError) 포함
  }
}

export function canCopyImage(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof window !== "undefined" &&
    typeof window.ClipboardItem !== "undefined"
  );
}

export async function copyPngBlob(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
