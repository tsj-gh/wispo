import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

export const metadata: Metadata = {
  title: "運営者情報 | Wispo",
  description:
    "Wispo の運営目的、運営方針（一次情報）、制作体制、更新方針、お問い合わせ方針を公開しています。",
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "運営者情報", href: "/operator" },
]);

export default function OperatorPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-5">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
        <nav aria-label="パンくずリスト" className="mb-2 text-xs text-[var(--color-muted)]">
          <ol className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 p-0">
            <li className="inline-flex items-center gap-1.5">
              <Link href="/" className="text-[var(--color-muted)] no-underline hover:underline">
                ホーム
              </Link>
              <span aria-hidden>{">"}</span>
            </li>
            <li className="text-[var(--color-text)]">運営者情報</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-black text-[var(--color-text)]">運営者情報</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Wispo は、家庭学習で継続しやすいデジタル知育教材を目指して運営している、個人開発ベースの教育コンテンツプロジェクトです。
        </p>
      </header>

      <section className="space-y-3">
        <article className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--color-text)]">運営目的</h2>
          <p className="mt-1 m-0 text-sm leading-relaxed text-[var(--color-muted)]">
            遊びとして成立する体験を維持しながら、空間把握・論理推論・数量感覚などの基礎認知スキルを自然に育てる教材を公開しています。
          </p>
        </article>

        <article
          className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] border-l-[3px] border-l-[color-mix(in_srgb,var(--color-text)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-4 py-3"
          aria-labelledby="operator-policy-heading"
        >
          <h2 id="operator-policy-heading" className="text-base font-bold text-[var(--color-text)]">
            運営方針（一次情報）
          </h2>
          <ul className="mt-2 m-0 list-none space-y-2 p-0 text-sm leading-relaxed text-[var(--color-muted)]">
            <li>
              <span className="font-semibold text-[var(--color-text)]">対象と前提</span>
              ：幼児から大人まで利用できる設計としつつ、低年齢では保護者の同伴・声かけを前提とした説明（保護者向けガイド、つまずき対処）を各教材ページに置いています。
            </li>
            <li>
              <span className="font-semibold text-[var(--color-text)]">教材設計の判断基準</span>
              ：①遊びとしての即時フィードバックと達成感、②学習意図が文章で追えること、③ページ間で同文の重複を避けること、の順で優先します。難易度やUIは継続的に見直し、更新履歴に根拠を残します。
            </li>
            <li>
              <span className="font-semibold text-[var(--color-text)]">更新・改善の進め方</span>
              ：不具合・可読性・導線は優先度高として扱い、知育コピーは観察ベースで差し替えます。方針転換があった場合は本ページまたは
              <Link href="/updates" className="text-[var(--color-accent)] hover:underline">
                更新履歴
              </Link>
              で明示します。
            </li>
            <li>
              <span className="font-semibold text-[var(--color-text)]">広告と編集</span>
              ：広告掲載はサイト運営のための手段であり、教材の目的や掲載順序を広告主に左右されません。本文が主、広告は補助的な位置づけとなるよう配置方針を取ります。
            </li>
          </ul>
        </article>

        <article className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--color-text)]">制作・運用体制</h2>
          <p className="mt-1 m-0 text-sm leading-relaxed text-[var(--color-muted)]">
            仕様設計・UI改善・知育解説の編集を継続的に実施し、更新内容は
            <Link href="/updates" className="ml-1 text-[var(--color-accent)] hover:underline">
              更新履歴
            </Link>
            で公開しています。
          </p>
        </article>

        <article className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--color-text)]">お問い合わせ方針</h2>
          <p className="mt-1 m-0 text-sm leading-relaxed text-[var(--color-muted)]">
            不具合報告、導入相談、改善提案は
            <Link href="/contact" className="ml-1 text-[var(--color-accent)] hover:underline">
              お問い合わせページ
            </Link>
            から受け付けています。確認後、必要に応じて更新履歴に反映します。
          </p>
        </article>
      </section>
    </main>
  );
}
