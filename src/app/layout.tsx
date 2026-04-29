import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import "./globals.css";
import Footer from "@/components/Footer";
import { DebugThemeSelector } from "@/components/DebugThemeSelector";
import { SiteThemeProvider } from "@/components/SiteThemeProvider";
import { I18nProvider } from "@/lib/i18n-context";
import { UserSyncProvider } from "@/components/UserSyncProvider";
import { buildWispoSoftwareApplicationJsonLd } from "@/lib/wispoSoftwareApplicationJsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wispo.pages.dev";
const wispoSoftwareApplicationJsonLd = buildWispoSoftwareApplicationJsonLd(SITE_URL);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Wispo（ウィスポ）| デジタル知育教材スポット「Wispo（ウィスポ）」",
    template: "%s | Wispo",
  },
  description:
    "ようこそWispo（ウィスポ）へ。幼児から大人まで、遊びながら学べる無料のデジタル知育教材をWebブラウザで公開しています。かくれつみき（Hidden Stack）・タップぬりえ・Pair-Link・Skyscraper・Reflec-Shot・Pres-Sure Judge・はじけて！バブルなど。",
  keywords: ["知育", "パズル", "無料", "ロジックパズル", "ナンバーリンク", "スカイスクレイパー", "脳トレ"],
  openGraph: { type: "website", siteName: "Wispo" },
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  verification: {
    google: "PLAqEwb4uR64kDIAlUfM9VpPr35AFWwMTrGd4nYlobU",
  },  
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(wispoSoftwareApplicationJsonLd) }}
        />
        {process.env.NODE_ENV === "production" && (
          <>
            <Script
              src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5383262801288621"
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
            {/* GPT: googletag.pubads().refresh() 用（ペアリンク等の動的リフレッシュに必要） */}
            <Script
              src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
          </>
        )}
      </head>
      <body className="relative flex min-h-screen flex-col overflow-x-hidden bg-[var(--color-bg)] font-sans text-[var(--color-text)] antialiased">
        <UserSyncProvider>
          <I18nProvider>
            <SiteThemeProvider>
              <DebugThemeSelector />
              <div className="texture-overlay fixed inset-0 z-[5]" aria-hidden />
              <div className="relative z-10 flex min-h-screen flex-1 flex-col">
                {children}
                <Footer />
              </div>
            </SiteThemeProvider>
          </I18nProvider>
        </UserSyncProvider>
        {process.env.NODE_ENV === "production" ? <Analytics /> : null}
      </body>
    </html>
  );
}
