import type { Metadata } from "next";
import { Suspense } from "react";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import { FlagExplorerClient } from "@/components/lab/flag-guesser/FlagExplorerClient";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";

const jsonLd = buildGameSoftwareApplicationJsonLd("flag-guesser", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "フラッグゲッサー", href: "/lab/flag-guesser" },
  { label: "エクスプローラー", href: "/lab/flag-guesser/explorer" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.flagGuesserExplorer.title,
  description: gameLabPageSeo.flagGuesserExplorer.description,
  keywords: ["知育", "地理", "国旗", "ISO 3166", "難易度", "Wispo"],
  alternates: gameLabAlternates("/lab/flag-guesser/explorer"),
};

export default function FlagGuesserExplorerPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="min-h-[100dvh] w-full">
        <Suspense fallback={<div className="px-4 py-8 text-sm text-[var(--color-muted)]">読み込み中…</div>}>
          <FlagExplorerClient />
        </Suspense>
      </main>
    </>
  );
}
