# フラッグゲッサー — 学習段階と出題ルール（提案）

**目的:** `flag_difficulty.json` の国別 `difficulty`（1〜8）と ISO の **`sub_region`** を組み合わせ、**狭い国セットから順に広げる**カリキュラムで国旗と位置を覚える。

**現状の実装**（`flagGuesserCurriculum.ts` + `createCurriculumRoundPlan`）は **学習 Lv1〜20** を UI で切り替え可能。段階ごとのプール・お邪魔枚数・地図フィット（`sub_region` / `region`）・Lv19〜20 の confusable お邪魔に対応。旧 `createRoundPlan`（大陸全体お邪魔）は未使用。

---

## 設計の原則

1. **1 段階 = 1 つの学習単位** … 例:「西欧の超有名 3 か国だけ」「北欧の difficulty=1 だけ」。
2. **正解の `difficulty` は段階で上限を固定** … 初めは **`difficulty = 1` のみ**（全 22 か国）。慣れたら `≤2`、`≤3`…と段階的に緩める。
3. **`sub_region` で区切る** … 地図も **その段階のプールに含まれる国だけ** で外接フィット（ラテンアメリカ全体にブラジルだけ、を避ける）。
4. **お邪魔はプール内だけ** … 段階外の国の旗は出さない。
5. **枚数** … Lv1〜5 は **お邪魔 2（計 3 枚）**、Lv6 以降 **お邪魔 3（計 4 枚）**。

### ISO `sub_region` と日本語の対応（本提案で使う名称）

| ISO `sub_region` | 本ドキュメントでの呼び方 |
|------------------|--------------------------|
| Eastern Asia | 東アジア |
| Western Europe | 西ヨーロッパ |
| Northern America | 北米 |
| Northern Europe | 北欧 |
| Eastern Europe | 東欧 |
| Latin America and the Caribbean | 中南米・カリブ（出題プールは段階で絞る） |
| Southern Europe | 南欧 |
| Southern Asia | 南アジア |
| South-eastern Asia | 東南アジア |
| Western Asia | 西アジア |
| Australia and New Zealand | 豪州・NZ |
| Central Europe | 中欧 |
| Northern Africa | 北アフリカ |
| Sub-Saharan Africa | サハラ以南アフリカ |
| Central Asia | 中央アジア |
| Micronesia / Polynesia / Melanesia | 島嶼（大洋州） |

---

## 学習段階一覧（Lv1〜20）

各地域ブロックを **`difficulty = 1` のみ → 同地域で `≤2` → 大陸単位で `≤3`…** と積み上げ、その後 **似た旗・島嶼・全世界** へ。

| Lv | 名称 | 正解プール（`sub_region` + difficulty） | 正解数（目安） | 地図フィット | お邪魔 |
|----|------|----------------------------------------|----------------|--------------|--------|
| **1** | 東アジア・西ヨーロッパ・北米 | Eastern Asia, Western Europe, Northern America かつ **d=1** | **8** | 正解の **sub_region 内の全国**（Topo あり） | **0**（正解旗 1 枚のみ） |
| **2** | 北欧・東欧・中南米（入門） | Northern Europe, Eastern Europe, Latin America and the Caribbean かつ **d=1** | **7** | 同上 | **0**（正解旗 1 枚のみ） |

**地図の初期ズーム（Lv1〜2）:** `explorer_map_presets.json` の **中間リージョン**（なければサブリージョン）プリセットを適用。投影は explorer と同じ全世界 Mercator。
| **3** | 南欧（超有名） | Southern Europe かつ **d=1** | 3 | 同上 | 2・プール内 d=1 |
| **4** | 南アジア・西アジア・豪州 | Southern Asia, Western Asia, Australia and New Zealand かつ **d=1** | 3 | 同上 | 2・プール内 d=1 |
| **5** | 全世界・超有名マスター | 全 `sub_region` かつ **d=1** | **22** | 正解の sub_region のプール | 2・プール内 d=1 |
| **6** | 東南アジア | South-eastern Asia かつ **d≤2** | 8 | sub_region プール | 3・プール内 d≤2 |
| **7** | 西ヨーロッパ＋中欧 | Western Europe, Central Europe かつ **d≤2** | 8 | 同上 | 3 |
| **8** | 北欧・東欧 | Northern Europe, Eastern Europe かつ **d≤2** | 10 | 同上 | 3 |
| **9** | 南欧・東アジア | Southern Europe, Eastern Asia かつ **d≤2** | 12 | 同上 | 3 |
| **10** | 中南米（基礎） | Latin America… かつ **d≤2** | 6 | 同上（※プールは 6 国に限定） | 3 |
| **11** | 北アフリカ | Northern Africa かつ **d≤2** | 4 | 同上 | 3 |
| **12** | 北米・南アジア | Northern America, Southern Asia かつ **d≤2** | 6 | 同上 | 3 |
| **13** | ヨーロッパ全体（基礎） | region=Europe かつ **d≤3** | 約 35 | 正解 sub_region | 3 |
| **14** | アジア全体（基礎） | region=Asia かつ **d≤3** | 約 30 | 同上 | 3 |
| **15** | アメリカ大陸（基礎） | region=Americas かつ **d≤3** | 約 25 | 同上 | 3 |
| **16** | アフリカ入門 | Northern Africa + Sub-Saharan Africa かつ **d≤3** | 約 20 | 同上 | 3 |
| **17** | 四大大陸・標準 | Africa, Americas, Asia, Europe かつ **d≤4** | 約 180 | 正解 **region** | 3 |
| **18** | 大洋州・島嶼 | Oceania または Micronesia / Polynesia / Melanesia かつ **d≤5** | 約 25 | intermediate または sub_region | 3・スナップ強 |
| **19** | 似た旗・地理 | 全世界 かつ **d≤5** | — | region | 3・**confusable_colors** 1 + **confusable_region** 1 |
| **20** | マスター | 全世界 かつ **d≤8** | 249 | region | 4・confusable 混在・スナップなし |

※ **正解数**は `flag_difficulty.json`（2026-03）に Topo がある国だけを実装時に再集計する。

---

## フェーズ別のねらい

### フェーズ A — 超入門（Lv1〜2）… ご要望の粒度

**Lv1 — 東アジア・西ヨーロッパ・北米（`difficulty = 1` のみ）**

| alpha-3 | 国名（例） | sub_region |
|---------|------------|------------|
| CHN, JPN, KOR | 中・日・韓 | Eastern Asia |
| DEU, FRA, CHE | 独・仏・瑞 | Western Europe |
| USA, CAN | 米・加 | Northern America |

- ラウンドごとに上記 **8 か国のいずれか** が正解。
- 国旗カードは **正解 1 枚のみ**（お邪魔なし）。
- 地図は正解国の **sub_region（中間リージョン）に属する全国** を描画・フィット（出題プール外の隣国も表示）。

**Lv2 — 北欧・東欧・中南米入門（`difficulty = 1` のみ）**

| alpha-3 | sub_region |
|---------|------------|
| DNK, FIN, GBR, SWE | Northern Europe |
| RUS, UKR | Eastern Europe |
| BRA, MEX | Latin America and the Caribbean |

- 正解は **この 7 か国のいずれか**。国旗カードは正解 1 枚のみ。
- 地図は正解の sub_region 内の **全国** を表示（例: 中南米正解時はラテンアメリカ・カリブ全域をフィット、大陸 `region` 全体ではない）。

### フェーズ B — 超有名の完成（Lv3〜5）

- **Lv3:** 南欧の d=1（ESP, ITA, GRC）— 地中海周辺の「別ブロック」。
- **Lv4:** インド（IND）、トルコ（TUR）、オーストラリア（AUS）— 残りの d=1。
- **Lv5:** **全世界 22 か国・d=1 復習**。どの sub_region に出てもお邪魔は常に d=1 の 22 か国から。

ここまでで **「教材で最初に触れる国旗」は一通りクリア** した状態を目指す。

### フェーズ C — 地域別・d≤2（Lv6〜12）

東南アジア → 西欧拡大 → 北欧東欧 → 南欧東アジア → 中南米 6 か国 → 北アフリカ → 北米南アジア、と **1 sub_region（または近い組）ずつ** `difficulty ≤ 2` を足す。

**Lv10 中南米** のプール例（d≤2）: BRA, MEX, ARG, CHL, COL, JAM（6 か国）。カリブ諸島はまだ入れない。

### フェーズ D — 大陸ブロック・d≤3〜4（Lv13〜17）

大陸単位でまとめて慣れ、**中央値付近（d≤4）** まで一気に広げない（Lv17 で初めて四大大陸 d≤4）。

### フェーズ E — 島嶼・混同・上級（Lv18〜20）

- **Lv18:** 大洋州・島嶼（平均 difficulty が高いゾーン）。海上スナップ **強**（実装済みの近傍補正）。
- **Lv19:** `confusable_colors` / `confusable_region` でお邪魔を意図的に似せる。
- **Lv20:** 制限なしに近い全世界。

---

## 段階ごとの出題ルール（共通テンプレ）

各 Lv で次を **設定テーブル** として持つ（実装時は `flagGuesserCurriculum.ts` 等）。

| 項目 | 説明 |
|------|------|
| `level` | 1〜20 |
| `targetDifficultyMax` | 正解に許す difficulty の上限（例: 1 または 2） |
| `targetSubRegions` | 空なら `targetRegions` のみで判定 |
| `targetRegions` | 大陸で絞るとき（Lv13〜） |
| `extraAlpha3Allow` / `extraAlpha3Deny` | 例外（将来用） |
| `mapFitScope` | `pool`（推奨）\| `sub_region` \| `region` |
| `decoyCount` | 2 または 3 |
| `decoyDifficultyMax` | お邪魔の difficulty 上限（通常は正解と同じ） |
| `decoySource` | `pool_only` \| `pool_plus_confusable`（Lv19+） |
| `seaProximity` | `strong` \| `normal` \| `off` |

**抽選手順（1 ラウンド）**

1. 直近正解の `alpha-2` を除外。
2. 条件を満たす国のうち Topo・ISO ありから **正解** を 1 つ抽選。
3. **お邪魔** を `decoyCount` 枚、正解と同一プール（＋ Lv19 以降は confusable ルール）から抽選。
4. 地図は `mapFitScope=pool` なら **その Lv のプール内の全 alpha-3** のポリゴンで外接フィット。
5. カードをシャッフル。

---

## `difficulty = 1` の 22 か国（フェーズ A〜B の参照）

実データ（`flag_difficulty.json`）に基づく一覧。Lv1〜5 の割り当て確認用。

| sub_region | alpha-3 |
|------------|---------|
| Eastern Asia | CHN, JPN, KOR |
| Western Europe | CHE, DEU, FRA |
| Northern America | CAN, USA |
| Northern Europe | DNK, FIN, GBR, SWE |
| Eastern Europe | RUS, UKR |
| Latin America and the Caribbean | BRA, MEX |
| Southern Europe | ESP, GRC, ITA |
| Southern Asia | IND |
| Western Asia | TUR |
| Australia and New Zealand | AUS |

---

## 20 段階を超える場合（オプション Lv21〜24）

さらに細かくしたい場合の追加案:

| Lv | 内容 |
|----|------|
| 21 | カリブ（`intermediate_region = Caribbean`）d≤6 |
| 22 | ミクロネシア d≤7 |
| 23 | ポリネシア・メラネシア d≤7 |
| 24 | 全世界 d=8 のみ（最難 16 か国） |

---

## 実装メモ

- **プール生成:** `flag_difficulty.json` × `iso-3166.json` × Topo 収録 ID の交差で、Lv ごとの `Set<alpha-3>` をビルドする。
- **探索モードのプリセット**（`explorer_map_presets.json`）と **Lv8 / Lv18** の地図初期位置を揃えると、学習と練習が一致する。
- **UI:** ステージクリア制（Lv1 クリアで Lv2 解放）か、自由選択かはプロダクト判断。

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-03-19 | 初版（10 段階・旧方式） |
| 2026-03-19 | **学習カリキュラム型に改訂**（Lv1=東アジア・西欧・北米 d=1 のみ、Lv2=北欧・東欧・中南米 d=1、計 20 段階＋オプション 4） |
