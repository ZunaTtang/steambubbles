// 사이트 절대 URL — canonical·OG·sitemap·robots에 사용 (서버 전용).
// 배포 도메인은 SITE_URL 환경변수로 주입, 없으면(빈 문자열 포함) 프로덕션 기본값.
// ?? 가 아니라 트림+길이 체크: `SITE_URL=`(빈 값)이 new URL("")로 던지는 것 방지.
export function getSiteUrl(): string {
  const raw = process.env.SITE_URL?.trim();
  const url = raw && raw.length > 0 ? raw : "https://steambubbles.vercel.app";
  return url.replace(/\/$/, "");
}
