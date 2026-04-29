import { getSiteUrl } from "@/lib/siteUrl";

export type BreadcrumbEntry = {
  label: string;
  href: string;
};

export function buildBreadcrumbJsonLd(items: BreadcrumbEntry[]) {
  const baseUrl = getSiteUrl();
  const itemListElement = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.label,
    item: `${baseUrl}${item.href}`,
  }));

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}
