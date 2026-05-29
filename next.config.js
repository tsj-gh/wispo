/** @type {import('next').NextConfig} */
const assetBust =
  process.env.NEXT_PUBLIC_ASSET_BUST?.trim() ||
  process.env.GITHUB_SHA?.slice(0, 12) ||
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
  `local-${Date.now()}`;

const nextConfig = {
  output: "export",
  // 静的書き出しでは Next の画像最適化 API が使えないため必須（CDN 側の最適化と併用可）
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  // NOTE: output: "export" では next.config.js の redirects/headers は適用されないため、
  // Cloudflare Pages 向けに public/_redirects と public/_headers へ移管済み。
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    /** Vercel / Cloudflare Pages いずれでも先頭7桁を表示用に埋める */
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: (
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.CF_PAGES_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      ""
    ).slice(0, 7),
    /** ビルドごとに JS チャンクハッシュを変え、Pages の壊れた already-uploaded を回避 */
    NEXT_PUBLIC_ASSET_BUST: assetBust,
  },
};

module.exports = nextConfig;
