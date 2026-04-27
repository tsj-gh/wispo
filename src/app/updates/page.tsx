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
    date: "2026-04-25",
    title: "ゲームページ冒頭の教材概要を最適化",
    change: "見出し・タイトル閲覧後に教材概要を読む順へ調整し、ページ構造の自然さと可読性を改善しました。",
    background: "ゲーム表示の手前で説明が長く見える構造を避け、教材ページとしての読みやすさを保つためです。",
    userValue: "初回訪問者が迷わず遊び始めやすくなり、あとから教材意図も確認しやすくなりました。",
    related: { href: "/lab/hidden-stack", label: "かくれつみきを試す" },
  },
  {
    date: "2026-04-25",
    title: "AdSense 審査向けの情報整理",
    change: "トップページの信頼情報を強化し、各ラボページの情報重複を解消しました。",
    background: "クローラーが「運営主体」と「ページ固有性」を判別しやすい構成を優先したためです。",
    userValue: "教材の目的と運営意図を短時間で把握しやすくなり、導入判断がしやすくなりました。",
    related: { href: "/operator", label: "運営者情報を見る" },
  },
  {
    date: "2026-04-25",
    title: "Hidden Blocks（かくれつみき）改善",
    change: "グレード構成、質感ランダム抽選、空間推理の難易度調整を追加しました。",
    background: "同じ見た目の連続出題による単調さを抑え、推理の再現性を高める設計に寄せるためです。",
    userValue: "短時間でも飽きにくく、段階的に空間認識を伸ばしやすくなりました。",
    related: { href: "/lab/hidden-stack", label: "改善後のかくれつみきを遊ぶ" },
  },
  {
    date: "2026-04-24",
    title: "ラボページの説明情報拡張",
    change: "知育効果セクションと関連パズル導線を拡充しました。",
    background: "ページ単位で教材価値を説明し、単なるゲーム集に見えない構造を目指したためです。",
    userValue: "教材の狙いを比較しながら次に試すアプリを選びやすくなりました。",
    related: { href: "/lab/pair-link", label: "論理系教材の Pair-Link を見る" },
  },
] as const;

export default function UpdatesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-black text-[var(--color-text)]">更新履歴</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Wispo の教材改善・機能追加・不具合修正の履歴を公開しています。AdSense 審査や導入判断の参考としてご確認ください。
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
