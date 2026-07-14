import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, OPEN_LOCALES } from "./locales";

export const routing = defineRouting({
  locales: OPEN_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});
