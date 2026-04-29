import type { Metadata } from "next";
import { Suspense } from "react";
import { PrivacyPageContent } from "./PrivacyPageContent";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumbs";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "Wispoのプライバシーポリシー。個人情報の取扱い、広告配信、クッキー（Cookie）、アクセス解析についてご説明します。",
  keywords: ["知育", "パズル", "無料", "プライバシーポリシー"],
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { label: "ホーム", href: "/" },
  { label: "プライバシー", href: "/privacy" },
]);

export default function PrivacyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-bg)]" />}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <PrivacyPageContent />
    </Suspense>
  );
}
