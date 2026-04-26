import type { Metadata } from "next";
import { Suspense } from "react";
import { PresSureEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import PresSureJudgeGame from "./PresSureJudgeGame";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wit-spot.vercel.app";
const presSureJsonLd = buildGameSoftwareApplicationJsonLd("pres-sure-judge", SITE_URL);

export const metadata: Metadata = {
  title: gameLabPageSeo.presSureJudge.title,
  description: gameLabPageSeo.presSureJudge.description,
  keywords: ["知育", "パズル", "無料", "バランス", "判断力", "数量感覚", "タイムアタック", "幼児"],
  applicationName: "Wispo",
  alternates: gameLabAlternates("/lab/pres-sure-judge"),
  other: {
    "application:category": "EducationalGame",
    "application:operating-system": "Web Browser",
  },
};

export default function PresSureJudgePage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(presSureJsonLd) }} />
      <Suspense fallback={null}>
        <PresSureJudgeGame />
      </Suspense>
      <section className="mx-auto mt-6 w-full max-w-[1080px] px-4">
        <GameIntroMiniSection
          title="教材概要（Pres-Sure Judge）"
          body="時間制約下で天秤の均衡を見極める判断教材です。数量感覚と抑制制御を同時に使い、短いラウンドで意思決定の精度を高めます。"
        />
        <GamePrimaryContextSection
          title="想定する利用の目安"
          body="1セッションは数分程度の短いラウンドが中心です。連続プレイでは視覚疲労と判断の粗さが出やすいので、小学生以下では2〜3ラウンドごとに目を休める間隔を挟むと、教材としての効果が安定しやすいです。"
        />
      </section>
      <PresSureEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="Pres-Sure Judge"
        items={[
          { issue: "焦ってJudgeして失敗する", action: "残り時間が短くても、最後の1手前で左右差を声に出して確認してから確定します。" },
          { issue: "重りの配置意図を忘れる", action: "「左を+2」のように目的を短く決めてからドラッグすると判断が安定します。" },
          { issue: "連続ラウンドで精度が落ちる", action: "2〜3ラウンドごとに10秒休憩を入れ、視線を一度画面外に外すと回復しやすいです。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="Pres-Sure Judge"
        text="時間圧があるため、先に『今回は安全重視でいこう』など方針を決めてから始めると判断が安定します。失敗時は結果だけでなく『どの時点で急いだか』を一緒に振り返ると改善点が見えます。短い休憩を挟んで再挑戦する運用が、集中と自己調整の学習に効果的です。"
      />
      <OtherPuzzlesSection currentId="pres-sure-judge" />
    </>
  );
}
