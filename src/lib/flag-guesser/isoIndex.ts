import type { Iso3166Row } from "./types";

/** `country-code`（数値文字列）→ 行 */
export function indexIsoByCountryCode(rows: readonly Iso3166Row[]): Map<string, Iso3166Row> {
  const m = new Map<string, Iso3166Row>();
  for (const r of rows) {
    const code = r["country-code"]?.trim();
    if (code) m.set(code, r);
  }
  return m;
}

export function indexIsoByAlpha2(rows: readonly Iso3166Row[]): Map<string, Iso3166Row> {
  const m = new Map<string, Iso3166Row>();
  for (const r of rows) {
    const a2 = r["alpha-2"]?.trim();
    if (a2) m.set(a2.toUpperCase(), r);
  }
  return m;
}
