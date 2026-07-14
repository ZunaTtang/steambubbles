import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // /api, Next 내부 경로, 정적 파일 제외
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
