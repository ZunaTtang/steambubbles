import { DEFAULT_LOCALE } from "@/i18n/locales";
import { routing } from "@/i18n/routing";

// 사이트 절대 URL — canonical·OG·sitemap·robots에 사용 (서버 전용).
// 배포 도메인은 SITE_URL 환경변수로 주입, 없으면(빈 문자열 포함) 프로덕션 기본값.
// ?? 가 아니라 트림+길이 체크: `SITE_URL=`(빈 값)이 new URL("")로 던지는 것 방지.
export function getSiteUrl(): string {
  const raw = process.env.SITE_URL?.trim();
  const url = raw && raw.length > 0 ? raw : "https://steambubbles.vercel.app";
  return url.replace(/\/$/, "");
}

// canonical + hreflang alternates 생성. path는 로케일 뒤 경로("" | "/game/730" | "/about").
// 오픈된 모든 로케일에 hreflang, x-default는 기본 로케일(ko).
export function buildAlternates(
  path: string,
  locale: string,
): { canonical: string; languages: Record<string, string> } {
  const site = getSiteUrl();
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `${site}/${l}${path}`;
  languages["x-default"] = `${site}/${DEFAULT_LOCALE}${path}`;
  return { canonical: `${site}/${locale}${path}`, languages };
}
