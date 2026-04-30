import type { Metadata } from "next";
import { Suspense } from "react";
import { HiddenStackEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { GameAppUpdateHistorySection } from "@/components/lab/GameAppUpdateHistorySection";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import HiddenStackGame from "./HiddenStackGame";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";
import hiddenStackHistory from "../../../../history_2026_04_29_hidden-stack.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const hiddenStackJsonLd = buildGameSoftwareApplicationJsonLd("hidden-stack", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "かくれつみき", href: "/lab/hidden-stack" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.hiddenStack.title,
  description: gameLabPageSeo.hiddenStack.description,
  keywords: ["知育", "パズル", "3D", "空間認知", "かくれつみき", "積み木"],
  applicationName: "Wispo",
  alternates: gameLabAlternates("/lab/hidden-stack"),
  other: {
    "application:category": "EducationalGame",
    "application:operating-system": "Windows, macOS, Android, iOS",
  },
};

export default function HiddenStackPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hiddenStackJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-2 md:py-3 lg:max-w-none lg:px-0 lg:py-3">
        <Suspense
          fallback={
            <div className="flex min-h-[40dvh] flex-1 items-center justify-center bg-[var(--color-bg)] text-[var(--color-muted)]">
              読み込み中…
            </div>
          }
        >
          <div className="flex w-full flex-1 flex-col">
            <HiddenStackGame />
          </div>
        </Suspense>
        <GameIntroMiniSection
          title="かくれつみきとは"
          body="3D積み木の死角を推測し、見えない情報を数量として再構成する空間認識教材です。観察→仮説→検証の循環を短い問題で反復できます。"
        />
        <GamePrimaryContextSection
          title="この教材でよくある誤解"
          body="「見えているブロックの数を数えれば答えが出る」と捉えがちですが、本題は遮蔽された列の個数を推定することです。正面の見え方だけでなく、奥行きと死角の関係を前提にした推論が求められます。"
        />
        <GameOperatorMemoSection labId="hidden-stack" />
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（実際に子どもがつまずいた場面や、声かけで改善した例を1〜2文で追記すると教材固有性が高まります）" />
        </Suspense>
        <GameQuickInfoNote
          className="mt-6"
          goal="遮蔽を含む空間把握・数量推定・推理の言語化を促進"
          target="小学校低学年〜大人"
          operation="盤面を観察して死角の積み木数を選択し、ふりかえりで検証"
        />
      </main>
      <HiddenStackEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="かくれつみき"
        items={[
          { issue: "見えている数だけで答えてしまう", action: "手前・中央・奥で層を分け、見えない面に何個あり得るかを口に出して確認します。" },
          { issue: "2桁の推定で混乱する", action: "まず「最低何個あるか」を固定し、その後に「最大何個まで増えるか」を足し算で考えると安定します。" },
          { issue: "不正解でやる気を失う", action: "ふりかえり表示を使って「どの列の見積もりがズレたか」だけを特定し、次の1問で再挑戦します。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="かくれつみき"
        text="答えを先に伝えず、『どの面が見えていて、どこが見えていないか』を一緒に確認する進め方がおすすめです。迷ったら最低個数と最大個数を分けて考えるよう促すと推定が安定します。解答後に1列だけ振り返る習慣を作ると、空間推理の再現性が高まります。"
      />
      <GameAppUpdateHistorySection gameTitle="かくれつみき" entries={hiddenStackHistory} />
      <OtherPuzzlesSection currentId="hidden-stack" />
    </>
  );
}
