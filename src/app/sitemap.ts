import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/lab/tap-coloring`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${base}/lab/pop-pop-bubbles`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/pair-link`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/pres-sure-judge`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/skyscraper`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/reflec-shot`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/lab/hidden-stack`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${base}/columns/educational-value`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${base}/updates`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${base}/operator`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
