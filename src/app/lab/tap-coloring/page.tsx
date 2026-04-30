import type { Metadata } from "next";
import { Suspense } from "react";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";
import { TapColoringEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import { TapColoringLabShell } from "@/components/lab/TapColoringLabShell";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const tapColoringJsonLd = buildGameSoftwareApplicationJsonLd("tap-coloring", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "タップぬりえ", href: "/lab/tap-coloring" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.tapColoring.title,
  description: gameLabPageSeo.tapColoring.description,
  keywords: ["知育", "ぬりえ", "因果", "色彩", "幼児", "モンテッソーリ", "Wispo"],
  alternates: gameLabAlternates("/lab/tap-coloring"),
};

export default function TapColoringLabPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(tapColoringJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        <Suspense fallback={<div className="py-8 text-sm text-[var(--color-muted)]">読み込み中…</div>}>
          <TapColoringLabShell />
        </Suspense>
        <GameIntroMiniSection
          title="タップぬりえとは"
          body="色彩認知と原因理解を、短い操作と即時反応で学べる入門教材です。幼児でも始めやすいタップ中心の設計で、完成体験を積みながら集中の持続を育てます。"
        />
        <GamePrimaryContextSection
          title="想定する利用の目安"
          body="幼児では集中が5〜15分程度で切れやすいため、1枚を一度に仕上げるより「今日は下地まで」「次は枠だけ」など短い区切りで使うと続きやすく、色の因果も体験として残りやすいです。"
        />
        <GameOperatorMemoSection labId="tap-coloring" />
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（年齢別の集中時間や、実際に効果があった声かけを短く追記すると一次情報になります）" />
        </Suspense>
      </main>
      <TapColoringEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="タップぬりえ"
        items={[
          { issue: "色が思ったようにまとまらない", action: "最初は2〜3色に絞り、塗る順番を先に決めると迷いが減ります。" },
          { issue: "すぐ飽きてしまう", action: "1回で完成を目指さず、「今日は背景まで」のように短い目標を作ると続きやすいです。" },
          { issue: "はみ出しが気になって止まる", action: "正確さより完成経験を優先し、最後に見直し時間を1分だけ取る運用がおすすめです。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="タップぬりえ"
        text="はじめは色を3つに限定し、1枚を最後まで塗る体験を優先してください。迷った場面では正解を指示するより『次はどこを塗ると目立つかな？』と問いかけると、自分で選ぶ力が伸びます。終了後に『どの色の組み合わせが好き？』と短く振り返ると、言語化と色彩認知の両方を支えられます。"
      />
      <OtherPuzzlesSection currentId="tap-coloring" />
    </>
  );
}
