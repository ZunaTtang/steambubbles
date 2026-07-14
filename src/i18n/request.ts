import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // UI 문자열 소스는 ko.json. 타 로케일 사전은 빌드 전 자동 번역으로 생성해 커밋
  // (런타임 번역 API 호출 금지 — CLAUDE.md 7)
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
