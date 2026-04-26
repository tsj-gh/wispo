import type { Metadata } from "next";
import { Suspense } from "react";
import { PopPopBubblesEducationalSection } from "@/components/educational/PopPopBubblesEducationalSection";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { PopPopBubblesLabShell } from "@/components/lab/PopPopBubblesLabShell";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wit-spot.vercel.app";
const popPopBubblesJsonLd = buildGameSoftwareApplicationJsonLd("pop-pop-bubbles", SITE_URL);

export const metadata: Metadata = {
  title: gameLabPageSeo.popPopBubbles.title,
  description: gameLabPageSeo.popPopBubbles.description,
  keywords: ["知育", "手眼協調", "集中", "幼児", "バブル", "タップゲーム", "Wispo"],
  alternates: gameLabAlternates("/lab/pop-pop-bubbles"),
};
export default function PopPopBubblesPage() {
  return (
    <>
      <SmartGuardLock />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(popPopBubblesJsonLd) }}
      />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        <Suspense fallback={<div className="py-8 text-sm text-[var(--color-muted)]">読み込み中…</div>}>
          <PopPopBubblesLabShell />
        </Suspense>
        <GameIntroMiniSection
          title="教材概要（はじけて！バブル）"
          body="手眼協調と注意切替を、軽快なタップ体験で育てる入門教材です。短いラウンドで達成感を得やすく、低年齢でも継続しやすい構成です。"
        />
        <GamePrimaryContextSection
          title="この教材でよくある誤解"
          body="「連打や反射神経だけのゲーム」と捉えられがちですが、狙いを定めてからタップする方が高得点につながる設計です。視線の移動とターゲット選びの質が、手眼協調の練習対象になっています。"
        />
      </main>
      <PopPopBubblesEducationalSection />
      <GameTroubleshootingSection
        gameTitle="はじけて！バブル"
        items={[
          { issue: "狙ったバブルをタップしにくい", action: "端から順に処理するより、画面中央付近の密集領域を優先すると成功率が上がります。" },
          { issue: "連打で見落としが増える", action: "1秒に1回だけ「次の標的」を目で決める小休止を入れると精度が保てます。" },
          { issue: "途中で集中が切れる", action: "1ラウンドごとに達成目標（例: 5回連続成功）を設定し、短い区切りで遊ぶと続きます。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="はじけて！バブル"
        text="短時間で終わる区切りを作ると、集中が切れる前に達成感を得られます。『次は真ん中のバブルだけ狙おう』のように狙いを1つに絞る声かけが有効です。連打より観察を優先できた場面を具体的にほめると、注意切替の質が安定していきます。"
      />
      <OtherPuzzlesSection currentId="pop-pop-bubbles" />
    </>
  );
}
