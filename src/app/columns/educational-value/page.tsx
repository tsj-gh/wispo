import type { Metadata } from "next";
import { Suspense } from "react";
import { EducationalColumnArticle } from "@/components/educational/EducationalColumnArticle";
import { EducationalColumnWispoHeader } from "@/components/educational/EducationalColumnWispoHeader";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";

export const metadata: Metadata = {
  title: "知育コラム：Pair-Link・Reflec-Shot・Skyscraper・Pres-Sure Judge の知育効果",
  description:
    "Pair-Link・Reflec-Shot・Skyscraper・Pres-Sure Judge（プレッシャージャッジ）の知育効果を、脳科学・モンテッソーリ教育・難易度設計の観点から体系的に解説する固定ページ。",
  keywords: ["知育", "モンテッソーリ", "ロジックパズル", "前頭前野", "自己教育", "Wispo"],
  alternates: { canonical: `${BASE_URL}/columns/educational-value` },
};

export default function EducationalValueColumnPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-16 md:py-14">
      <Suspense fallback={<div className="mb-8 h-9 w-40 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]" aria-hidden />}>
        <EducationalColumnWispoHeader />
      </Suspense>
      <EducationalColumnArticle />
    </main>
  );
}
