"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

// 상세 페이지 상단 고정 네비 — 모바일에서 스크롤해도 항상 "버블맵으로" 복귀가 닿게.
// 스마트 백: 앱 안(버블맵 모달)에서 들어왔으면 router.back()으로 직전 상태·스크롤을
// 복원(새 히스토리 안 쌓음), 외부/SEO 직접 유입이면 홈으로 push.
export default function DetailBackBar() {
  const t = useTranslations("detail");
  const router = useRouter();

  const goBack = useCallback(() => {
    let internal = false;
    try {
      internal =
        sessionStorage.getItem("sb:nav") === "app" &&
        window.history.length > 1;
      sessionStorage.removeItem("sb:nav");
    } catch {
      // sessionStorage 접근 불가(프라이빗 모드 등) — 홈 push 폴백
    }
    if (internal) router.back();
    else router.push("/");
  }, [router]);

  return (
    <div className="sticky top-0 z-20 border-b border-neutral-800 bg-[#0a0a0f]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0a0a0f]/75">
      <div className="mx-auto flex max-w-2xl items-center px-4 py-2.5">
        <button
          onClick={goBack}
          className="-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 hover:text-white active:scale-95"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          {t("backHome")}
        </button>
      </div>
    </div>
  );
}
