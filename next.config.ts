import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // 홈 디렉토리에 다른 lockfile이 있어 워크스페이스 루트 오탐 방지
  turbopack: { root: __dirname },
  images: {
    // Steam 게임 아트 CDN
    remotePatterns: [
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "shared.fastly.steamstatic.com" },
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
