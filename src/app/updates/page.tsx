import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DevTjEditorialNote } from "@/components/DevTjEditorialNote";

export const metadata: Metadata = {
  title: "更新履歴 | Wispo",
  description: "Wispo の機能改善・教材追加・不具合修正の履歴です。",
};

const UPDATES = [
  {
    date: "2026-04-28",
    title: "運営方針と各教材の運営メモを公開",
    change:
      "運営者情報ページに「運営方針（一次情報）」を追加し、全ラボページに本番表示の運営メモを実装しました。",
    background:
      "「誰が、どの方針で運営し、どのように改善しているか」を利用者に明確に示す必要があったためです。",
    userValue:
      "教材の設計意図と更新方針を事前に把握しやすくなり、導入の安心感が高まります。",
    related: { href: "/operator", label: "運営方針（一次情報）を見る" },
  },
  {
    date: "2026-04-27",
    title: "更新履歴のフォーマットを統一",
    change:
      "更新履歴を「変更内容・背景・利用者メリット」の3項目で統一し、各項目に関連ページへの文脈リンクを追加しました。",
    background:
      "更新の意図と利用者価値を機械・人の両方が読み取りやすい形で継続提示するためです。",
    userValue:
      "改善内容の意味を短時間で理解でき、必要な教材ページへすぐ遷移できます。",
    related: { href: "/updates", label: "更新履歴の最新形式を見る" },
  },
  {
    date: "2026-04-25",
    title: "サイト全体の情報設計と導線を強化",
    change:
      "上部教材概要、運営者ページ導線、更新履歴ページ、つまずき対処、保護者向けガイドを全体設計として追加しました。",
    background:
      "単発ゲーム集ではなく、教育目的と運営実体が伝わるサイト構造へ移行する必要があったためです。",
    userValue:
      "初回訪問でも「何を学べるか」「どう使えば良いか」をページ内で完結して理解しやすくなりました。",
    related: { href: "/updates", label: "更新履歴をさらに見る" },
  },
  {
    date: "2026-04-26",
    title: "サイトマップと説明文をHidden Stack対応に更新",
    change:
      "主要教材の `hidden-stack` をサイトマップへ正式追加し、ルート説明文と各ラボの一次情報ブロックを更新しました。",
    background:
      "新規教材をクローラーが安定して発見できる状態と、トップ説明の実態一致を確保する必要があったためです。",
    userValue:
      "検索・回遊の双方でHidden Stackへ到達しやすくなり、最新教材を見つけやすくなりました。",
    related: { href: "/lab/hidden-stack", label: "かくれつみきを試す" },
  },
  {
    date: "2026-04-24",
    title: "Hidden Blocks（かくれつみき）を正式導入",
    change:
      "3D空間推理教材として Hidden Stack を追加し、回答UI・ふりかえり・可変グレード・質感バリエーションを段階的に実装しました。",
    background:
      "既存の平面パズルとは異なる空間認知トレーニングを提供し、教材ポートフォリオを広げるためです。",
    userValue:
      "観察→推理→検証の流れを短時間で反復でき、空間把握の練習を継続しやすくなりました。",
    related: { href: "/lab/hidden-stack", label: "Hidden Blocks（かくれつみき）を遊ぶ" },
  },
  {
    date: "2026-04-19",
    title: "検索基盤（sitemap/robots/metadata）を整備",
    change:
      "サイトマップ、robots、各ページのメタ情報を整備し、プレビュー環境の noindex 制御も導入しました。",
    background:
      "本番URLの評価を安定させ、重複インデックスやクロールの揺れを防ぐ必要があったためです。",
    userValue:
      "必要なページが検索で見つかりやすくなり、古い・重複したURLへ迷い込みにくくなりました。",
    related: { href: "/sitemap.xml", label: "サイトマップを確認する" },
  },
  {
    date: "2026-04-18",
    title: "トップ導線と言語対応を教育サイト向けに再設計",
    change:
      "トップコピー、ヒーロー構成、ローカライズ、SEOメタを見直し、教材の目的が先に伝わる情報配置へ更新しました。",
    background:
      "初回訪問時に遊び方だけでなく「学習価値」が読み取れる導線を優先するためです。",
    userValue:
      "目的に合う教材へ最短で到達しやすくなり、サイト全体の理解コストが下がりました。",
    related: { href: "/", label: "トップページの導線を見る" },
  },
  {
    date: "2026-04-17",
    title: "タップぬりえに作品履歴と高画質書き出しを追加",
    change:
      "作品履歴ギャラリー、編集再開、額縁付きエクスポート（PNG）を実装し、保存・共有体験を強化しました。",
    background:
      "1回遊んで終わる体験から、制作を継続・振り返りできる教材体験へ拡張するためです。",
    userValue:
      "作品を残して比較できるため達成感が高まり、継続学習のモチベーションを維持しやすくなりました。",
    related: { href: "/lab/tap-coloring", label: "タップぬりえで制作を始める" },
  },
  {
    date: "2026-04-16",
    title: "全ラボのレイアウトを統一し学習導線を改善",
    change:
      "ゲーム本体、補足情報、関連導線の配置を全ラボで統一し、PC/モバイル双方で読み進めやすい構成に再編しました。",
    background:
      "教材ごとに操作導線が大きく異なると、学習の連続性が損なわれるためです。",
    userValue:
      "別教材へ移動しても迷いにくくなり、継続利用時の操作ストレスが減少しました。",
    related: { href: "/lab/reflec-shot", label: "統一後のラボ構成を確認する" },
  },
  {
    date: "2026-04-15",
    title: "全ゲームに構造化データと知育導線を実装",
    change:
      "SoftwareApplication JSON-LD、各ページの説明整備、知育導線の明確化を全ゲームへ展開しました。",
    background:
      "クローラーに教材の種類と用途を正しく伝え、検索面での文脈理解を高める必要があったためです。",
    userValue:
      "検索結果から教材内容を想像しやすくなり、目的に合うページへ到達しやすくなりました。",
    related: { href: "/columns/educational-value", label: "知育コラムを見る" },
  },
  {
    date: "2026-04-14",
    title: "新作「はじけて！バブル」を追加",
    change:
      "低年齢向けのタップ教材として Pop-Pop Bubbles を追加し、視覚演出と操作性を含む基本体験を整備しました。",
    background:
      "論理系中心だったラインナップに、短時間で成功体験を得やすい教材を加えるためです。",
    userValue:
      "年齢や集中時間に合わせて教材を選びやすくなり、導入ハードルが下がりました。",
    related: { href: "/lab/pop-pop-bubbles", label: "はじけて！バブルを遊ぶ" },
  },
  {
    date: "2026-04-09",
    title: "タップぬりえを独立教材として本格実装",
    change:
      "塗り判定、混色、ステージ進行、素材更新を段階的に整備し、入門向け教材として単独運用できる完成度へ引き上げました。",
    background:
      "未就学〜低学年でも直感的に取り組める教材を早期に拡充するためです。",
    userValue:
      "短時間で達成体験を得ながら、色彩認知と操作の安定を反復できるようになりました。",
    related: { href: "/lab/tap-coloring", label: "タップぬりえを遊ぶ" },
  },
  {
    date: "2026-04-03",
    title: "知育コラムと多言語導線を拡張",
    change:
      "知育コラムの固定ページ化、主要ページの言語切替、/lab へのルート統一を実施しました。",
    background:
      "教材の背景説明と導線を分離し、利用者層と検索流入の両方に対応するためです。",
    userValue:
      "ゲームだけでなく学習目的の解説も参照しやすくなり、理解を深めながら利用できます。",
    related: { href: "/columns/educational-value", label: "知育コラムを読む" },
  },
  {
    date: "2026-03-25",
    title: "Reflec-Shotを新規追加し段階難易度を構築",
    change:
      "反射ルールを扱う新規パズルを追加し、グレード別の生成ロジックとクリア体験を段階的に整備しました。",
    background:
      "空間推理・予測力を鍛える教材領域を拡張し、学習テーマの幅を広げるためです。",
    userValue:
      "難易度に応じて無理なく取り組めるため、継続して推理力を鍛えやすくなりました。",
    related: { href: "/lab/reflec-shot", label: "Reflec-Shotを遊ぶ" },
  },
  {
    date: "2026-03-24",
    title: "サイトの基盤品質と信頼情報を初回強化",
    change:
      "プライバシー情報、404整備、誤クリック対策、コンテンツ薄化への対策、サイト構造の見直しをまとめて実施しました。",
    background:
      "広告掲載可否以前に、サイト品質と信頼情報の不足を先に解消する必要があったためです。",
    userValue:
      "運営実体と利用ルールが明確になり、安心して利用しやすいサイト構成になりました。",
    related: { href: "/privacy", label: "プライバシーポリシーを確認する" },
  },
  {
    date: "2026-03-22",
    title: "Pair-Linkの生成アルゴリズムを刷新",
    change:
      "盤面生成を大幅に見直し、大きなサイズでも成立しやすい出題ロジックと難易度制御へ更新しました。",
    background:
      "単調な出題や破綻盤面を減らし、論理学習としての安定性を高めるためです。",
    userValue:
      "サイズを上げても解きごたえが保たれ、連続プレイ時の体験品質が向上しました。",
    related: { href: "/lab/pair-link", label: "Pair-Linkを遊ぶ" },
  },
  {
    date: "2026-03-20",
    title: "Pair-LinkとSkyscraperに再現可能な盤面生成を導入",
    change:
      "同じ条件なら同じ問題が再現されるシード基盤をPair-LinkとSkyscraperに導入し、出題の一貫性を高めました。",
    background:
      "難易度の比較や振り返りの際、出題条件が明確に再現できる方が学習設計上望ましいためです。",
    userValue:
      "同じ盤面を再挑戦したり、保護者と一緒に手順を確認しやすくなりました。",
    related: { href: "/lab/skyscraper", label: "Skyscraperを遊ぶ" },
  },
  {
    date: "2026-03-20",
    title: "学習記録の保存・同期を導入",
    change:
      "匿名の学習記録（クリア履歴・活動日数）を保存し、進捗を継続利用できる仕組みを実装しました。",
    background:
      "単発プレイだけでなく、学習の積み上げを可視化する基盤が必要だったためです。",
    userValue:
      "継続状況を確認しながら利用できるため、日々の学習習慣化につながりやすくなりました。",
    related: { href: "/", label: "トップから学習記録対応教材を探す" },
  },
  {
    date: "2026-03-18",
    title: "Pres-Sure Judgeの数量判断体験を本格整備",
    change:
      "天秤を用いた短時間の判断遊びとして、在庫からの投げ入れ、ラウンド切替、モバイル向けレイアウトなど操作体験を一通り整備しました。",
    background:
      "数量感覚と抑制制御を、短いラウンドで反復しやすい形に落とし込む必要があったためです。",
    userValue:
      "小さな成功と修正を繰り返しながら、判断の型を身につけやすくなりました。",
    related: { href: "/lab/pres-sure-judge", label: "Pres-Sure Judgeを遊ぶ" },
  },
  {
    date: "2026-03-16",
    title: "ブランド統一と教材サイトへの転換",
    change:
      "名称を Wispo に統一し、教育文脈の説明・構造化データを含むサイト方針へ段階的に移行しました。",
    background:
      "開発実験中心の構成から、公開教材サイトとして継続運用できる土台へ切り替えるためです。",
    userValue:
      "サイト全体の目的が分かりやすくなり、教材選択時の迷いが減りました。",
    related: { href: "/", label: "Wispoのトップを見る" },
  },
  {
    date: "2026-03-14",
    title: "公開運用の基本ページを整備",
    change:
      "Next.js移行とあわせて、プライバシーポリシー・お問い合わせなど公開運用に必要な基本ページを整備しました。",
    background:
      "教材公開サイトとしての最低限の信頼基盤を早期に整える必要があったためです。",
    userValue:
      "問い合わせ先や利用方針を確認でき、初回利用時の不安を減らせるようになりました。",
    related: { href: "/contact", label: "お問い合わせページを見る" },
  },
] as const;

export default function UpdatesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-black text-[var(--color-text)]">更新履歴</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Wispo の教材改善・機能追加・不具合修正の履歴を公開しています。導入検討や継続利用の参考としてご確認ください。
        </p>
        <Suspense fallback={null}>
          <DevTjEditorialNote text="※ここは運営者による手書きのコメントがより相応しい（更新の背景・観察結果・失敗談を短文で補足すると一次情報として強くなります）" />
        </Suspense>
      </header>
      <section className="space-y-3" aria-label="更新一覧">
        {UPDATES.map((entry) => (
          <article
            key={`${entry.date}-${entry.title}`}
            className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-4 py-3"
          >
            <p className="m-0 text-xs font-semibold tracking-wide text-[var(--color-primary)]">{entry.date}</p>
            <h2 className="mt-1 text-base font-bold text-[var(--color-text)]">{entry.title}</h2>
            <dl className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">
              <div>
                <dt className="font-semibold text-[var(--color-text)]">変更内容</dt>
                <dd className="m-0">{entry.change}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--color-text)]">背景</dt>
                <dd className="m-0">{entry.background}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--color-text)]">利用者メリット</dt>
                <dd className="m-0">{entry.userValue}</dd>
              </div>
            </dl>
            <p className="mt-2 m-0 text-sm">
              <Link
                href={entry.related.href}
                className="font-semibold text-[var(--color-primary)] underline decoration-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] underline-offset-2"
              >
                {entry.related.label}
              </Link>
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
