/**
 * Cloudflare Pages の「already uploaded」で壊れた同一ハッシュ資産を引きずらないよう、
 * ビルドごとに変わる ID をバンドルへ埋め込む（docs/CLOUDFLARE_PAGES_DEPLOY.md）。
 */
export const PAGES_ASSET_BUST =
  process.env.NEXT_PUBLIC_ASSET_BUST?.trim() ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
  "dev";

void PAGES_ASSET_BUST;
