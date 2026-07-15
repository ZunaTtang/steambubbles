import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/site";

// 소개 페이지 — 현재 ko만 오픈이라 본문은 한국어. 타 로케일 오픈 시 로케일별 콘텐츠로 분기.

export const revalidate = 86400; // ISR — 완전 정적 렌더 시 next-intl 요청 스코프 문제 회피

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("nav.about"), alternates: buildAlternates("/about", locale) };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-4 text-sm text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          {t("detail.home")}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-400">{t("nav.about")}</span>
      </nav>

      <h1 className="mb-4 text-2xl font-bold text-neutral-100">
        {t("site.title")} 소개
      </h1>

      <div className="space-y-4 leading-relaxed text-neutral-300">
        <p>
          {t("site.title")}은(는) 스팀(Steam) 게임의 <strong>실시간 동시
          접속자 수</strong>와 <strong>할인 정보</strong>를 버블맵으로 한눈에
          보여주는 발견 도구입니다. 지금 어떤 게임이 인기 있고(동접), 어떤 게임이
          지금 사기 좋은지(할인)를 하나의 화면에서 탐색할 수 있습니다.
        </p>
        <p>
          모든 데이터는 <strong>스팀 공식·공개 API</strong>에서 수집하며, 동접
          정보는 약 10분 주기로, 가격·평점 정보는 매일 자동 갱신됩니다. 버블의
          크기는 현재 동시 접속자 수, 색상은 접속자 변화율을 나타내고, 노란
          테두리는 할인 중인 게임을 뜻합니다.
        </p>
        <p>
          이 사이트는 <strong>도구</strong>입니다 — 회원가입·로그인·댓글 같은
          커뮤니티 기능은 제공하지 않으며, 개인정보를 수집하지 않습니다. 게임
          가격은 스팀 공식 가격만 표시하며, 구매는 각 게임의 스팀 상점 페이지에서
          이루어집니다.
        </p>
      </div>

      <div className="mt-8 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        <Link href="/privacy" className="hover:text-neutral-400">
          {t("nav.privacy")}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/" className="hover:text-neutral-400">
          {t("detail.backHome")}
        </Link>
      </div>
    </main>
  );
}
