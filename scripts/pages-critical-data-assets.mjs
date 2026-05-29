/**
 * HTML に直接埋め込まれないが、クライアント fetch で必須の静的データ。
 * verify-pages-out（デプロイ前）と smoke-pages-production（デプロイ後）で共通利用。
 */
export const CRITICAL_DATA_ASSETS = [
  "/assets/flag-guesser/iso-3166.json",
  "/assets/flag-guesser/flag_difficulty.json",
  "/assets/flag-guesser/flag_aspect_ratio.json",
  "/assets/flag-guesser/explorer_map_presets.json",
];

export const MIN_DATA_ASSET_BYTES = 32;
