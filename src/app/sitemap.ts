import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getTrackedAppids } from "@/lib/data";
import { getSiteUrl } from "@/lib/site";

// 동적 사이트맵 — 오픈된 모든 로케일(ko·en). 홈 + 정적 페이지 + 추적 게임 상세.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  // 빌드/재검증 시 Neon 일시 오류로 sitemap 생성이 실패하지 않도록 우아하게 강등
  // (게임 목록은 다음 revalidate에 채워짐)
  let appids: number[] = [];
  try {
    appids = await getTrackedAppids();
  } catch {
    appids = [];
  }
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
