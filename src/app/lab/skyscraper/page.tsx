import type { Metadata } from "next";
import { Suspense } from "react";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";
import { SkyscraperEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import SkyscraperGame from "./SkyscraperGame";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const skyscraperJsonLd = buildGameSoftwareApplicationJsonLd("skyscraper", SITE_URL);

export const metadata: Metadata = {
  title: gameLabPageSeo.skyscraper.title,
  description: gameLabPageSeo.skyscraper.description,
  keywords: ["知育", "パズル", "無料", "スカイスクレイパー", "ビルパズル", "ロジックパズル", "算数", "幼児"],
  applicationName: "Wispo",
  alternates: gameLabAlternates("/lab/skyscraper"),
  other: {
    "application:category": "EducationalGame",
    "application:operating-system": "Windows, macOS, Android, iOS",
  },
};

export default function SkyscraperPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(skyscraperJsonLd) }} />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        <Suspense fallback={<div className="flex min-h-[40dvh] flex-1 items-center justify-center bg-[var(--color-bg)] text-[var(--color-muted)]">読み込み中…</div>}>
          <SkyscraperGame />
        </Suspense>
        <GameIntroMiniSection
          title="教材概要（Skyscraper）"
          body="外周ヒントを使って内部配置を推理する制約充足型の教材です。候補整理と演繹推論を段階的に育て、算数的な場合分けの基礎づくりに役立ちます。"
        />
        <GamePrimaryContextSection
          title="この教材でよくある誤解"
          body="ヒントの数字は「その方向から見たビルの本数」というパズル固有の意味であり、単純な足し算や教科書の「高さの問題」と同じ読み方にはなりません。視点の制約から逆算してマスごとの高さを決めていく点が本質です。"
        />
        <GameOperatorMemoSection labId="skyscraper" />
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（どのヒントから着手すると進みやすいか、実際の指導順を補足すると有益です）" />
        </Suspense>
      </main>
      <SkyscraperEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="Skyscraper"
        items={[
          { issue: "候補が多すぎて止まる", action: "まずヒント1やNが作る確定配置から埋め、候補を一気に減らします。" },
          { issue: "行列の重複管理が難しい", action: "行と列を交互に見るリズムに固定し、確定値を入れたら必ず反対軸を更新します。" },
          { issue: "推理が行き詰まる", action: "1マスだけ仮置きして矛盾チェックする「短い仮説検証」を使うと再開しやすいです。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="Skyscraper"
        text="最初は『1』や最大値ヒントから確定するマスだけを一緒に探し、全体を一気に解こうとしない進め方がおすすめです。止まったら『この行でまだ置ける数字は何個？』と候補整理を促してください。答え合わせでは正誤より、どの根拠で置いたかを話せた点を評価すると継続しやすくなります。"
      />
      <OtherPuzzlesSection currentId="skyscraper" />
    </>
  );
}
