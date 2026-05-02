type SupportedGameAppId =
  | "tap-coloring"
  | "pop-pop-bubbles"
  | "pair-link"
  | "pres-sure-judge"
  | "skyscraper"
  | "reflec-shot"
  | "hidden-stack"
  | "flag-guesser";

type GameJsonLdSeed = {
  name: string;
  path: `/${string}`;
  description: string;
  featureList: string[];
};

const GAME_JSONLD_SEEDS: Record<SupportedGameAppId, GameJsonLdSeed> = {
  "tap-coloring": {
    name: "タップぬりえ",
    path: "/lab/tap-coloring",
    description:
      "タップ入力に対して色が即時に広がる設計を採用し、因果理解と色彩認知を同時に育成する知育アプリです。手眼協調、注意の持続、自己修正の反復を無理なく促し、幼児期の基礎的な非認知能力の形成を支援します。",
    featureList: ["手眼協調", "色彩認知", "因果理解", "注意の持続", "幼児向け直感操作"],
  },
  "pop-pop-bubbles": {
    name: "はじけて！バブル",
    path: "/lab/pop-pop-bubbles",
    description:
      "浮遊する対象へ継続的にタップ反応する課題として設計し、手眼協調、注意の切替、反応速度の基礎を育てる知育ミニゲームです。短い試行で達成感を得られるため、低年齢層でも集中の再起動と自己効力感の形成を段階的に支援します。",
    featureList: ["手眼協調", "注意の切替", "反応速度", "集中持続", "幼児向けタップ操作"],
  },
  "pair-link": {
    name: "ペアリンク",
    path: "/lab/pair-link",
    description:
      "交差禁止と全マス充填という二重制約を同時に扱う課題設計により、論理的推論、ワーキングメモリ、先読み計画を統合的に鍛える知育パズルです。試行錯誤から仮説修正へ進む学習サイクルを自然に形成し、思考の持久力を高めます。",
    featureList: ["論理的推論", "ワーキングメモリ", "経路計画", "制約充足", "自己修正学習"],
  },
  "pres-sure-judge": {
    name: "プレッシャージャッジ",
    path: "/lab/pres-sure-judge",
    description:
      "時間制約下で天秤の均衡を判断し続けるゲーム構造により、数量感覚、抑制制御、意思決定を一体的に訓練する知育コンテンツです。運動操作と認知負荷を連動させることで、焦りの中でも根拠を持って選ぶ実行機能の育成を狙います。",
    featureList: ["数量感覚", "抑制制御", "意思決定", "時間制約タスク", "非認知能力"],
  },
  skyscraper: {
    name: "スカイスクレイパー",
    path: "/lab/skyscraper",
    description:
      "外周ヒントから内部の高さ配置を推理する制約充足課題として設計し、空間把握、演繹推論、仮説検証の循環を強化する知育パズルです。誤りが即座に可視化されるため自己調整学習が進み、数理的思考の土台形成に有効です。",
    featureList: ["空間把握", "演繹推論", "仮説検証", "数理的思考", "自己調整学習"],
  },
  "reflec-shot": {
    name: "リフレクショット",
    path: "/lab/reflec-shot",
    description:
      "反射規則と軌道予測を扱う物理シミュレーション型課題として構成し、空間推理、系列保持、戦略更新を段階的に鍛える知育ラボです。直感的な操作と記号的な判断を往復させることで、予測精度と認知的柔軟性の向上を支えます。",
    featureList: ["物理シミュレーション", "空間推理", "軌道予測", "戦略更新", "系列保持"],
  },
  "hidden-stack": {
    name: "かくれつみき",
    path: "/lab/hidden-stack",
    description:
      "3×3×3 の積み木を限定視点から観察し、死角に隠れた立方体の個数を推測する空間課題です。落下演出と物理フィードバックを通じて、遮蔽関係の想像と検証のサイクルを促します。",
    featureList: ["空間推理", "遮蔽と可視性", "数量推定", "物理フィードバック", "試行と検証"],
  },
  "flag-guesser": {
    name: "フラッグゲッサー",
    path: "/lab/flag-guesser",
    description:
      "リージョンにズームした世界地図へ国旗を重ね、国と旗の対応を学ぶ地理体験のプロトタイプです。ドラッグ操作と色フィードバックで位置判断と記号の結びつきを反復しやすくします。",
    featureList: ["地理", "国旗", "地図読み", "空間配置", "自己検証学習"],
  },
};

export function buildGameSoftwareApplicationJsonLd(
  gameId: SupportedGameAppId,
  siteUrl: string
): Record<string, unknown> {
  const base = siteUrl.replace(/\/$/, "");
  const seed = GAME_JSONLD_SEEDS[gameId];

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: seed.name,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web Browser",
    description: seed.description,
    url: `${base}${seed.path}`,
    featureList: seed.featureList,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
      availability: "https://schema.org/InStock",
    },
    provider: {
      "@type": "Organization",
      name: "Wispo",
      url: base,
    },
  };
}
