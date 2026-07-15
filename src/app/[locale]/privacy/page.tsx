import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/site";

// 개인정보처리방침 — 애드센스 승인 요건. 제목·내비는 로케일별(t()), 본문은 아직 한국어만(미번역).
// TODO(운영자): 광고/애널리틱스 실제 도입 시점과 문의 연락처를 확정해 갱신할 것.

export const revalidate = 86400; // ISR — 완전 정적 렌더 시 next-intl 요청 스코프 문제 회피

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("nav.privacy"),
    alternates: buildAlternates("/privacy", locale),
  };
}

export default async function PrivacyPage({ params }: Props) {
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
        <span className="text-neutral-400">{t("nav.privacy")}</span>
      </nav>

      <h1 className="mb-4 text-2xl font-bold text-neutral-100">
        {t("nav.privacy")}
      </h1>

      <div className="space-y-5 leading-relaxed text-neutral-300">
        <section>
          <h2 className="mb-1 font-semibold text-neutral-200">
            1. 수집하는 개인정보
          </h2>
          <p>
            본 사이트는 회원가입·로그인 기능이 없으며, 이름·이메일 등 어떠한
            개인 식별 정보도 수집하거나 저장하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-200">2. 쿠키</h2>
          <p>
            사용자 편의를 위한 <strong>기능 쿠키</strong>만 사용합니다. 선택한
            통화·언어 설정을 저장해 다음 방문 시 유지하는 용도이며, 즐겨찾기와
            화면 설정은 브라우저 로컬 저장소(localStorage)에 저장됩니다. 이
            데이터는 사용자의 기기에만 남고 서버로 전송되지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-200">
            3. 제3자 서비스 (광고·분석)
          </h2>
          <p>
            향후 본 사이트에 Google AdSense 등 제3자 광고가 게재될 경우, Google을
            비롯한 광고 공급업체는 쿠키를 사용해 사용자의 이전 방문 기록을 바탕으로
            광고를 게재할 수 있습니다. 사용자는{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#16c784] hover:underline"
            >
              Google 광고 설정
            </a>
            에서 맞춤 광고를 비활성화할 수 있습니다. 또한 익명 집계 방식의 방문
            분석 도구를 사용할 수 있으며, 이 경우에도 개인을 식별하는 정보는
            수집하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-200">4. 외부 링크</h2>
          <p>
            본 사이트는 각 게임의 스팀(Steam) 공식 상점 페이지로 연결되는 링크를
            제공합니다. 외부 사이트의 개인정보 처리에 대해서는 해당 사이트의
            방침을 따릅니다.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-200">5. 문의</h2>
          <p>
            본 방침 또는 사이트 관련 문의는 운영자에게 연락해 주시기 바랍니다.
          </p>
        </section>
      </div>

      <div className="mt-8 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        <Link href="/about" className="hover:text-neutral-400">
          {t("nav.about")}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/" className="hover:text-neutral-400">
          {t("detail.backHome")}
        </Link>
      </div>
    </main>
  );
}
