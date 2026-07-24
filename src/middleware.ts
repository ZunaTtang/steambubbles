import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // /api, Next 내부 경로, 정적 파일(.ico/.svg 등 점 포함) 제외.
  // + 확장자 없는 메타데이터 라우트 /icon(icon.tsx) 제외 — 안 하면 로케일 리다이렉트에
  //   먹혀 파비콘이 opaqueredirect로 깨진다(점 있는 icon.svg는 자동 제외됐지만 /icon은 아님).
  matcher: "/((?!api|_next|_vercel|icon|.*\\..*).*)",
};
