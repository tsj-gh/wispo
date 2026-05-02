import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";

/** 各ラボ／ゲームページの title / description（知育目的を明示） */
export const gameLabPageSeo = {
  tapColoring: {
    title: "タップぬりえ | 直感と論理を育む知育パズル Wispo",
    description:
      "ブラウザで遊べる無料のタップぬりえ。線画にタップで色を塗り、因果理解・色彩認知を楽しく鍛えられます。知育効果と遊び方の解説付き。",
  },
  popPopBubbles: {
    title: "はじけて！バブル | 直感と論理を育む知育パズル Wispo",
    description:
      "幼児向けのタップ知育ゲーム。バブルを素早く見分けて反応する遊びを通じて、手眼協調・注意の切替・短時間判断を育てます。",
  },
  pairLink: {
    title: "ペアリンク | 直感と論理を育む知育パズル Wispo",
    description:
      "同じ数字を交差せずにつなぎ、盤面を埋めるロジックパズル。制約下の探索、先読み、ワーキングメモリを総合的に鍛えます。",
  },
  presSureJudge: {
    title: "プレッシャージャッジ | 直感と論理を育む知育パズル Wispo",
    description:
      "時間制約下で天秤の均衡を判断する数量推理ゲーム。重り配置と確定タイミングの選択で、抑制制御と意思決定を鍛えます。",
  },
  skyscraper: {
    title: "スカイスクレイパー | 直感と論理を育む知育パズル Wispo",
    description:
      "外周ヒントから内部の高さ配置を導く本格推理パズル。演繹推論・場合分け・検証思考を段階的に伸ばせます。",
  },
  reflecShot: {
    title: "リフレクショット | 直感と論理を育む知育パズル Wispo",
    description:
      "反射板の向きを操作して射出体を導く空間推理ゲーム。角度・軌道の予測と戦略更新を、短い試行で繰り返し学べます。",
  },
  hiddenStack: {
    title: "かくれつみき | 直感と論理を育む知育パズル Wispo",
    description:
      "3D積み木の死角にある個数を推測する空間認識パズル。見える情報から見えない量を再構成し、数概念と論理推論をつなげます。",
  },
  flagGuesser: {
    title: "フラッグゲッサー | 直感と論理を育む知育パズル Wispo",
    description:
      "地域にズームした地図へ国旗をドラッグして重ね、国と記号の対応を学ぶ地理クイズのプロトタイプ。位置判断とフィードバックで地理区分の直感を育てます。",
  },
} as const;

export function gameLabAlternates(path: `/${string}`): Metadata["alternates"] {
  return { canonical: `${BASE_URL}${path}` };
}
