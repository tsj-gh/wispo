/** サイトの絶対URL（末尾スラッシュなし）。sitemap / robots / canonical 用 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
  return raw.replace(/\/+$/, "");
}
