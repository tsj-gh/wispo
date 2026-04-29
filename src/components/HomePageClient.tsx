"use client";

import Link from "next/link";
import { DevLink } from "@/components/DevLink";
import { HomePageLinks } from "@/components/HomePageLinks";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n-context";

export function HomePageClient() {
  const { t } = useI18n();

  return (
    <>
      <header className="flex w-full items-center justify-between gap-3 py-6 animate-fade-in-up">
        <DevLink
          href="/"
          className="flex min-w-0 items-center gap-3 text-xl font-black leading-none tracking-wider text-[var(--color-text)] no-underline hover:opacity-90 sm:text-2xl"
        >
          <span className="block h-8 w-8 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-primary))]" />
          Wispo
        </DevLink>
        <LanguageToggle />
      </header>

      <section className="pb-8 pt-2 text-center animate-fade-in-up-delay sm:pb-10 sm:pt-1">
        <h1 className="mb-4 text-2xl font-extrabold leading-tight bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] bg-clip-text text-transparent max-[374px]:text-xl sm:mb-5 sm:text-3xl md:text-4xl xl:text-5xl 2xl:text-[3.25rem]">
          <span className="block whitespace-nowrap">{t("home.heroTitleLine1")}</span>
          <span className="inline-block whitespace-nowrap">{t("home.heroTitleLine2")}</span>
        </h1>
        <div className="mx-auto max-w-[600px] space-y-3 text-[clamp(15px,2vw,19px)] leading-snug text-[var(--color-muted)] sm:leading-relaxed">
          <p>{t("home.heroLine1")}</p>
          <p>
            {t("home.heroLine2a")}
            <wbr />
            {t("home.heroLine2b")}
          </p>
        </div>
      </section>

      <HomePageLinks />

      <section className="animate-fade-in-up-delay-more border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] pb-8 pt-6 md:pt-8">
        <h2 className="mb-1.5 text-lg font-bold text-[var(--color-text)]">{t("home.sectionColumnTitle")}</h2>
        <p className="mb-5 text-sm leading-snug text-[var(--color-muted)]">
          <Link
            href="/columns/educational-value"
            className="font-medium text-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-muted)] hover:underline"
          >
            {t("home.sectionColumnLink")}
          </Link>
        </p>
        <h2 className="mb-4 text-xl font-bold text-[var(--color-text)]">{t("home.sectionAboutTitle")}</h2>
        <p className="mb-4 whitespace-pre-line leading-relaxed text-[var(--color-muted)]">{t("home.sectionAboutBody")}</p>
        <h2 className="mb-3 mt-6 text-lg font-bold text-[var(--color-text)]">{t("home.sectionUsageTitle")}</h2>
        <p className="mb-4 leading-relaxed text-[var(--color-muted)]">
          {t("home.sectionUsageBeforeContact")}
          <a href="/contact" className="text-[var(--color-accent)] hover:underline">
            {t("home.sectionUsageContact")}
          </a>
          {t("home.sectionUsageMid")}
          <a href="/privacy" className="text-[var(--color-accent)] hover:underline">
            {t("home.sectionUsagePrivacy")}
          </a>
          {t("home.sectionUsageAfter")}
        </p>

        <h2 className="mb-3 mt-6 text-lg font-bold text-[var(--color-text)]">{t("home.sectionWhyUsefulTitle")}</h2>
        <p className="mb-4 whitespace-pre-line leading-relaxed text-[var(--color-muted)]">{t("home.sectionWhyUsefulBody")}</p>

        <h2 className="mb-3 mt-6 text-lg font-bold text-[var(--color-text)]">{t("home.sectionPolicyTitle")}</h2>
        <p className="mb-4 whitespace-pre-line leading-relaxed text-[var(--color-muted)]">{t("home.sectionPolicyBody")}</p>

        <h2 className="mb-3 mt-6 text-lg font-bold text-[var(--color-text)]">{t("home.sectionOperatorTitle")}</h2>
        <p className="mb-2 whitespace-pre-line leading-relaxed text-[var(--color-muted)]">{t("home.sectionOperatorBody")}</p>
        <p className="mb-4 leading-relaxed text-[var(--color-muted)]">
          {t("home.sectionOperatorContactLead")}
          <Link href="/contact" className="text-[var(--color-accent)] hover:underline">
            {t("home.sectionUsageContact")}
          </Link>
          {t("home.sectionOperatorContactTail")}
        </p>

        <h2 className="mb-3 mt-6 text-lg font-bold text-[var(--color-text)]">{t("home.sectionUpdatesTitle")}</h2>
        <p className="mb-1 leading-relaxed text-[var(--color-muted)]">{t("home.sectionUpdatesBody")}</p>
        <p className="mb-2">
          <Link href="/updates" className="font-medium text-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-muted)] hover:underline">
            {t("home.sectionUpdatesLink")}
          </Link>
        </p>
      </section>
    </>
  );
}
