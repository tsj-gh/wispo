import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import hiddenStackHistory from "../../history_2026_04_29_hidden-stack.json";
import pairLinkHistory from "../../history_2026_04_29_pair-link.json";
import popPopBubblesHistory from "../../history_2026_04_29_pop-pop-bubbles.json";
import presSureJudgeHistory from "../../history_2026_04_29_pres-sure-judge.json";
import reflecShotHistory from "../../history_2026_04_29_reflec-shot.json";
import skyscraperHistory from "../../history_2026_04_29_skyscraper.json";
import tapColoringHistory from "../../history_2026_04_29_tap-coloring.json";

type HistoryEntry = {
  date: string;
};

function latestDate(entries: HistoryEntry[], fallback: string): Date {
  const newest = entries.reduce((maxDate, entry) => (entry.date > maxDate ? entry.date : maxDate), fallback);
  return new Date(`${newest}T00:00:00+09:00`);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const hiddenStackUpdated = latestDate(hiddenStackHistory, "2026-04-01");
  const pairLinkUpdated = latestDate(pairLinkHistory, "2026-04-01");
  const popPopBubblesUpdated = latestDate(popPopBubblesHistory, "2026-04-01");
  const presSureJudgeUpdated = latestDate(presSureJudgeHistory, "2026-04-01");
  const reflecShotUpdated = latestDate(reflecShotHistory, "2026-04-01");
  const skyscraperUpdated = latestDate(skyscraperHistory, "2026-04-01");
  const tapColoringUpdated = latestDate(tapColoringHistory, "2026-04-01");
  const latestLabUpdated = new Date(
    Math.max(
      hiddenStackUpdated.getTime(),
      pairLinkUpdated.getTime(),
      popPopBubblesUpdated.getTime(),
      presSureJudgeUpdated.getTime(),
      reflecShotUpdated.getTime(),
      skyscraperUpdated.getTime(),
      tapColoringUpdated.getTime()
    )
  );

  return [
    { url: `${base}/`, lastModified: latestLabUpdated, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/lab/tap-coloring`, lastModified: tapColoringUpdated, changeFrequency: "weekly", priority: 0.95 },
    { url: `${base}/lab/pop-pop-bubbles`, lastModified: popPopBubblesUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/pair-link`, lastModified: pairLinkUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/pres-sure-judge`, lastModified: presSureJudgeUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/skyscraper`, lastModified: skyscraperUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/reflec-shot`, lastModified: reflecShotUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/hidden-stack`, lastModified: hiddenStackUpdated, changeFrequency: "weekly", priority: 0.95 },
    { url: `${base}/columns/educational-value`, lastModified: new Date("2026-04-03T00:00:00+09:00"), changeFrequency: "monthly", priority: 0.85 },
    { url: `${base}/updates`, lastModified: new Date("2026-04-28T00:00:00+09:00"), changeFrequency: "weekly", priority: 0.75 },
    { url: `${base}/operator`, lastModified: new Date("2026-04-28T00:00:00+09:00"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, lastModified: new Date("2026-03-14T00:00:00+09:00"), changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: new Date("2026-03-14T00:00:00+09:00"), changeFrequency: "yearly", priority: 0.5 },
  ];
}
