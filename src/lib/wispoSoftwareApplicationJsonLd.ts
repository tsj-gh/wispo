/**
 * サイト全体の SoftwareApplication 構造化データ（JSON-LD）。
 * AdSense / 検索向けに、各ゲームを hasPart で列挙する。
 */
export function buildWispoSoftwareApplicationJsonLd(siteUrl: string): Record<string, unknown> {
  const base = siteUrl.replace(/\/$/, "");

  const freeOffer = {
    "@type": "Offer",
    price: "0",
    priceCurrency: "JPY",
    availability: "https://schema.org/InStock",
  };

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Wispo (ウィスポ)",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web Browser",
    description:
      "幼児から大人まで、遊びながら学べる無料のデジタル知育教材をWebブラウザで公開するスポット。",
    url: base,
    offers: freeOffer,
    provider: {
      "@type": "Organization",
      name: "Wispo",
      url: base,
    },
    hasPart: [
      {
        "@type": "SoftwareApplication",
        name: "タップぬりえ",
        url: `${base}/lab/tap-coloring`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "タップ入力に対して色が即時に広がる設計を採用し、因果理解と色彩認知を同時に育成する知育アプリです。手眼協調、注意の持続、自己修正の反復を無理なく促し、幼児期の基礎的な非認知能力の形成を支援します。",
        featureList: ["直感操作", "原因と結果", "色彩の遊び", "幼児向け知育", "ブラウザで無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "はじけて！バブル",
        url: `${base}/lab/pop-pop-bubbles`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "画面内を漂う対象へ短い間隔でタップ反応する遊びを通じ、手眼協調、注意の切替、反応速度の基礎を育てる知育ミニゲームです。難しい説明を介さずに成功体験を積み重ねられるため、低年齢層の導入教材として扱いやすい設計です。",
        featureList: ["手眼協調", "反応と集中", "直感的タッチ", "幼児向け", "無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "Hidden Blocks（かくれつみき）",
        url: `${base}/lab/hidden-stack`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "3D空間に積まれたブロックを限定視点から観察し、死角の個数を推測する空間認識パズルです。見える情報から見えない量を再構成する反復を通じ、空間把握・論理的推論・数量感覚の統合を促します。",
        featureList: ["空間把握能力", "論理的推論", "数概念の定着", "段階別グレード", "無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "ペアリンク",
        url: `${base}/lab/pair-link`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "交差禁止と全マス充填という二重制約を同時に扱う課題設計により、論理的推論、ワーキングメモリ、先読み計画を統合的に鍛える知育パズルです。試行錯誤から仮説修正へ進む学習サイクルを自然に形成し、思考の持久力を高めます。",
        featureList: ["論理的思考", "経路推理", "試行錯誤", "算数的発想", "無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "プレッシャージャッジ",
        url: `${base}/lab/pres-sure-judge`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "時間制約下で天秤の均衡を判断し続けるゲーム構造により、数量感覚、抑制制御、意思決定を一体的に訓練する知育コンテンツです。運動操作と認知負荷を連動させることで、焦りの中でも根拠を持って選ぶ実行機能の育成を狙います。",
        featureList: ["バランス判断", "時間制限下の集中", "数量感覚", "意思決定", "無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "スカイスクレイパー",
        url: `${base}/lab/skyscraper`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "外周ヒントから内部の高さ配置を推理する制約充足課題として設計し、空間把握、演繹推論、仮説検証の循環を強化する知育パズルです。誤りが即座に可視化されるため自己調整学習が進み、数理的思考の土台形成に有効です。",
        featureList: ["制約充足", "論理の積み上げ", "数感", "本格ロジックパズル", "無料"],
        offers: freeOffer,
      },
      {
        "@type": "SoftwareApplication",
        name: "リフレクショット",
        url: `${base}/lab/reflec-shot`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web Browser",
        description:
          "反射規則と軌道予測を扱う物理シミュレーション型課題として構成し、空間推理、系列保持、戦略更新を段階的に鍛える知育ラボです。直感的な操作と記号的な判断を往復させることで、予測精度と認知的柔軟性の向上を支えます。",
        featureList: ["空間推理", "反射と角度", "軌道の予測", "幾何直感", "無料"],
        offers: freeOffer,
      },
    ],
  };
}
