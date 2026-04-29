"use client";

import { Suspense } from "react";
import { PageHeaderWithDevLinks } from "@/components/PageHeaderWithDevLinks";
import { TopBackLink } from "@/components/TopBackLink";
import { useI18n } from "@/lib/i18n-context";

export function ContactPageContent() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-[680px] w-full px-6">
      <Suspense
        fallback={
          <header className="flex justify-between items-center py-8">
            <a href="/" className="text-[var(--color-text)] font-black">
              Wispo
            </a>
            <a href="/" className="text-[var(--color-muted)] text-sm">
              ←
            </a>
          </header>
        }
      >
        <PageHeaderWithDevLinks
          breadcrumbs={[
            { label: "ホーム", href: "/" },
            { label: "お問い合わせ", href: "/contact" },
          ]}
        />
      </Suspense>

      <main className="pb-20">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-[var(--color-text)]">{t("contact.title")}</h1>
        <p className="text-[var(--color-muted)] text-[15px] leading-relaxed mb-8">{t("contact.intro")}</p>

        <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] backdrop-blur">
          <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLSdT4fq8tjaTrGe0uojoix3OfNzAeJ5Hzq1Aal92OF0QGINTEw/viewform?embedded=true"
            width="100%"
            height={857}
            frameBorder={0}
            marginHeight={0}
            marginWidth={0}
            title={t("contact.iframeTitle")}
            className="min-h-[800px] w-full"
          >
            {t("contact.iframeLoading")}
          </iframe>
        </div>

        <p className="text-center mt-6">
          <Suspense
            fallback={
              <a
                href="/"
                className="inline-block px-5 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-text)] no-underline text-sm font-medium"
              >
                {t("common.backToTop")}
              </a>
            }
          >
            <TopBackLink />
          </Suspense>
        </p>
      </main>
    </div>
  );
}
