import Image from "next/image";
import Link from "next/link";

type AppCard = {
  id: "tap-coloring" | "pop-pop-bubbles" | "pair-link" | "pres-sure-judge" | "skyscraper" | "reflec-shot" | "hidden-stack";
  title: string;
  href: `/${string}`;
  emoji: string;
  summary: string;
};

const APP_CARDS: AppCard[] = [
  {
    id: "tap-coloring",
    title: "タップぬりえ",
    href: "/lab/tap-coloring",
    emoji: "🖍️",
    summary: "色彩と因果を体験する直感プレイ",
  },
  {
    id: "pop-pop-bubbles",
    title: "はじけて！バブル",
    href: "/lab/pop-pop-bubbles",
    emoji: "🫧",
    summary: "軽快タップで協調と集中を育てる",
  },
  {
    id: "hidden-stack",
    title: "かくれつみき",
    href: "/lab/hidden-stack",
    emoji: "🧱",
    summary: "死角を含めて積み木数を推理する空間パズル",
  },
  {
    id: "pair-link",
    title: "ペアリンク",
    href: "/lab/pair-link",
    emoji: "✨",
    summary: "経路を組み立てる論理パズル",
  },
  {
    id: "pres-sure-judge",
    title: "プレッシャージャッジ",
    href: "/lab/pres-sure-judge",
    emoji: "⚖️",
    summary: "天秤バランスで判断力を鍛える",
  },
  {
    id: "skyscraper",
    title: "スカイスクレイパー",
    href: "/lab/skyscraper",
    emoji: "🏢",
    summary: "外周ヒントから高さを推理",
  },
  {
    id: "reflec-shot",
    title: "リフレクショット",
    href: "/lab/reflec-shot",
    emoji: "🪞",
    summary: "反射と軌道の空間推理ゲーム",
  },
];

type OtherPuzzlesSectionProps = {
  currentId: AppCard["id"];
};

export function OtherPuzzlesSection({ currentId }: OtherPuzzlesSectionProps) {
  const cards = APP_CARDS.filter((card) => card.id !== currentId);

  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-12" aria-label="他の知育パズルに挑戦">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">他の知育パズルに挑戦</h2>
      <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]"
          >
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
              <Image
                src="/icons/icon-192.png"
                alt=""
                fill
                sizes="44px"
                className="object-cover opacity-35"
              />
              <span className="absolute inset-0 grid place-items-center text-xl" aria-hidden>
                {card.emoji}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{card.title}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{card.summary}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
