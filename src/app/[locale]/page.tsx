import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{t("heading")}</h1>
      <p className="max-w-xl text-neutral-400">{t("tagline")}</p>
      <p className="mt-4 rounded-full border border-neutral-700 px-4 py-1.5 text-sm text-neutral-500">
        {t("status")}
      </p>
    </main>
  );
}
