import type { Metadata } from "next";
import { Suspense } from "react";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import { FlagGuesserLabShell } from "@/components/lab/flag-guesser/FlagGuesserLabShell";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const flagGuesserJsonLd = buildGameSoftwareApplicationJsonLd("flag-guesser", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "フラッグゲッサー", href: "/lab/flag-guesser" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.flagGuesser.title,
  description: gameLabPageSeo.flagGuesser.description,
  keywords: ["知育", "地理", "国旗", "地図", "ISO 3166", "Wispo"],
  alternates: gameLabAlternates("/lab/flag-guesser"),
};

export default function FlagGuesserLabPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(flagGuesserJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        {/* FlagGuesserPlayfield は `useSearchParams`（?devtj=true デバッグ）のため Suspense 内に置く */}
        <Suspense fallback={<div className="py-8 text-sm text-[var(--color-muted)]">読み込み中…</div>}>
          <div className="flex min-h-[min(62dvh,720px)] flex-1 flex-col">
            <FlagGuesserLabShell />
          </div>
        </Suspense>
        <GameIntroMiniSection
          title="フラッグゲッサーとは"
          body="ランダムに選ばれた地域にズームした地図上で、国旗カードと国の位置を対応づけるプロトタイプです。ドラッグ操作と視覚的フィードバックで、地理区分と記号（国旗）の結びつきを楽しく確認できます。"
        />
        <GamePrimaryContextSection
          title="ねらい（このプロトタイプで確認すること）"
          body="同一リージョン内の国々を俯瞰しつつ、国旗という強い記号で位置を固定する体験です。誤答時は領域の色が変わるため、推測と検証のサイクルを短く回せます。"
        />
        <GameOperatorMemoSection labId="flag-guesser" />
      </main>
      <GameTroubleshootingSection
        gameTitle="フラッグゲッサー"
        items={[
          { issue: "国が重なって選びにくい", action: "ドラッグ中は対象国が強調されるので、境界に沿って少しずつ動かしてみてください。" },
          { issue: "国旗が吸い付かない", action: "ハイライトされた国の上で指を離すと固定されます。別の国に置きたい場合は一度タップしてから動かします。" },
          { issue: "地域が狭く見える", action: "出題は ISO の Region 単位でフィルタされるため、ヨーロッパなど広域になることがあります。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="フラッグゲッサー"
        text="地理の宿題の足がかりとして、まずは「この地域にどんな国があるか」を地図で眺めてから国旗を当てはめると理解が深まります。誤答後は色の変化と地名表示を一緒に確認すると、次の推論に活かせます。"
      />
      <OtherPuzzlesSection currentId="flag-guesser" />
    </>
  );
}
