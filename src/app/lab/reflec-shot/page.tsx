import type { Metadata } from "next";
import { Suspense } from "react";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";
import { ReflecLabEducationalI18n } from "@/components/educational/GameEducationalI18n";
import { GameIntroMiniSection } from "@/components/lab/GameIntroMiniSection";
import { GameOperatorMemoSection } from "@/components/lab/GameOperatorMemoSection";
import { GamePrimaryContextSection } from "@/components/lab/GamePrimaryContextSection";
import { GameTroubleshootingSection } from "@/components/lab/GameTroubleshootingSection";
import { OtherPuzzlesSection } from "@/components/lab/OtherPuzzlesSection";
import { ParentGuideNote } from "@/components/lab/ParentGuideNote";
import { SmartGuardLock } from "@/components/lab/SmartGuardLock";
import ReflecShotGame from "./ReflecShotGame";
import { gameLabAlternates, gameLabPageSeo } from "@/lib/gameLabPageSeo";
import { buildGameSoftwareApplicationJsonLd } from "@/lib/gameSoftwareApplicationJsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const reflecShotJsonLd = buildGameSoftwareApplicationJsonLd("reflec-shot", SITE_URL);
const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "教材一覧", href: "/#lab-cards" },
  { label: "リフレクショット", href: "/lab/reflec-shot" },
]);

export const metadata: Metadata = {
  title: gameLabPageSeo.reflecShot.title,
  description: gameLabPageSeo.reflecShot.description,
  keywords: ["知育", "空間推理", "反射", "幾何", "パズル", "Wispo"],
  applicationName: "Wispo",
  alternates: gameLabAlternates("/lab/reflec-shot"),
};

export default function ReflecShotLabPage() {
  return (
    <>
      <SmartGuardLock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reflecShotJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-4 py-4 md:py-6 lg:max-w-[1400px] lg:px-6">
        <Suspense fallback={<div className="py-8 text-sm text-[var(--color-muted)]">読み込み中…</div>}>
          <ReflecShotGame />
        </Suspense>
        <GameIntroMiniSection
          title="リフレクショットとは"
          body="反射規則と軌道予測を扱う空間推理教材です。短い試行で仮説を検証できるため、戦略更新と見通しの良い思考習慣を育てます。"
        />
        <GamePrimaryContextSection
          title="想定する利用の目安"
          body="1問あたりは短い試行で成立する設計のため、10〜20分で複数ステージを試す使い方が現実的です。反射の組み合わせが難しい日は、回転だけに絞った練習回を挟むと挫折感を抑えつつ空間推理を積み上げられます。"
        />
        <GameOperatorMemoSection labId="reflec-shot" />
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（つまずきやすい反射パターンと、1反射から教える手順を実例で補足すると効果的です）" />
        </Suspense>
      </main>
      <ReflecLabEducationalI18n />
      <GameTroubleshootingSection
        gameTitle="リフレクショット"
        items={[
          { issue: "反射方向が毎回逆になる", action: "1回目は「1反射先」だけを予測し、2反射以上は後から積み上げて考えます。" },
          { issue: "目標宝石数まで届かない", action: "ゴール直行より先に、宝石が密な経路を優先して射線を作ると達成しやすくなります。" },
          { issue: "操作が複雑に感じる", action: "回転操作だけで1問解く回を作り、慣れてから長押し・スワイプ操作を追加します。" },
        ]}
      />
      <ParentGuideNote
        gameTitle="リフレクショット"
        text="反射が難しいときは、まず1回反射で届くかだけを確認し、複数反射は段階的に増やしてください。『次に向きが変わるのはどこ？』と位置予測を言葉にする声かけが有効です。失敗時はバンパー配置を1つだけ変えて再試行すると、仮説検証の感覚が育ちます。"
      />
      <OtherPuzzlesSection currentId="reflec-shot" />
    </>
  );
}
