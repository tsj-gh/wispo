import type { Metadata } from "next";
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
    body: "見出し・タイトル閲覧後に教材概要を読む順へ調整し、ページ構造の自然さと可読性を改善。各ゲームのつまずき対処も継続更新しました。",
  },
  {
    date: "2026-04-25",
    title: "AdSense 審査向けの情報整理",
    body: "トップページの信頼情報を強化し、各ラボページの情報重複を解消。コンテンツの独自性を高める導線を整備しました。",
  },
  {
    date: "2026-04-25",
    title: "Hidden Blocks（かくれつみき）改善",
    body: "グレード構成、質感ランダム抽選、空間推理の難易度調整を追加し、UI の可読性と操作性を継続改善しました。",
  },
  {
    date: "2026-04-24",
    title: "ラボページの説明情報拡張",
    body: "知育効果セクションと関連パズル導線を拡充。教育目的が読み取りやすい構成に更新しました。",
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
            <p className="mt-1 m-0 text-sm leading-relaxed text-[var(--color-muted)]">{entry.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
