import type { Metadata } from "next";
import { Suspense } from "react";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";
import { PairLinkEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import PairLinkGame from "./PairLinkGame";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const pairLinkJsonLd = buildGameSoftwareApplicationJsonLd("pair-link", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "ペアリンク", href: "/lab/pair-link" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.pairLink.title,
  description: gameLabPageSeo.pairLink.description,
  keywords: ["知育", "パズル", "無料", "ナンバーリンク", "ペアリンク", "ロジックパズル", "算数", "幼児"],
  applicationName: "Wispo",
  alternates: gameLabAlternates("/lab/pair-link"),
  other: {
    "application:category": "EducationalGame",
    "application:operating-system": "Windows, macOS, Android, iOS",
  },
};

export default function PairLinkPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pairLinkJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        <Suspense fallback={<div className="flex min-h-[40dvh] flex-1 items-center justify-center bg-[var(--color-bg)] text-[var(--color-muted)]">読み込み中…</div>}>
          <PairLinkGame />
        </Suspense>
        <GameIntroMiniSection
          title="ペアリンクとは"
          body="交差禁止と全マス充填の制約を同時に扱う論理教材です。先読みと自己修正を繰り返し、試行錯誤の質を高める設計になっています。"
        />
        <GamePrimaryContextSection
          title="この教材でよくある誤解"
          body="「同じ数字同士を最短距離でつなげばよい」と思いがちですが、線は交差できず、かつ盤面のすべてのマスを埋める必要があります。距離最優先ではなく、通路の確保と残りマスの整合が同時に成り立つかが判断の中心になります。"
        />
        <GameOperatorMemoSection labId="pair-link" />
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（行き詰まりやすい盤面パターン、再開のコツを実例で1〜2文追記すると価値が上がります）" />
        </Suspense>
      </main>
      <PairLinkEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="ペアリンク"
        items={[
          { issue: "途中で線が詰んで戻れなくなる", action: "端点が少ないペアからでなく、狭い通路を先に確保すると詰みにくくなります。" },
          { issue: "交差禁止を守ると進まない", action: "確定線と仮線を意識的に分け、仮線は短い区間ごとに検証して進めます。" },
          { issue: "全マス埋めが難しい", action: "残り空白を1〜2マス単位で見て、孤立マスが出ないかを都度チェックします。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="ペアリンク"
        text="行き詰まったときは盤面全体を解かせるのではなく、『今はこの2つの数字だけつないでみよう』と範囲を狭めると再開しやすくなります。間違いを指摘するより『この線のあと空きマスはどうなる？』と問い返すと、先読みが育ちます。最後に解き方を一言説明させると、推理の再現性が高まります。"
      />
      <OtherPuzzlesSection currentId="pair-link" />
    </>
  );
}
