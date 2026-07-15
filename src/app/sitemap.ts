import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getTrackedAppids } from "@/lib/data";
import { getSiteUrl } from "@/lib/site";

// 동적 사이트맵 — 오픈된 로케일(현재 ko)만. 홈 + 정적 페이지 + 추적 게임 상세.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const appids = await getTrackedAppids();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    entries.push({
      url: `${base}/${locale}`,
      changeFrequency: "hourly",
      priority: 1,
    });
    entries.push({ url: `${base}/${locale}/about`, changeFrequency: "monthly", priority: 0.3 });
    entries.push({ url: `${base}/${locale}/privacy`, changeFrequency: "yearly", priority: 0.1 });
    for (const appid of appids) {
      entries.push({
        url: `${base}/${locale}/game/${appid}`,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  }
  return entries;
}
