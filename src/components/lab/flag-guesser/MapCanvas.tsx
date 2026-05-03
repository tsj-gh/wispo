/**
 * フラッグゲッサー地図まわりの表示ヘルパー。
 * ビュー変換・ズーム型は viewportGeo 経由で共有。描画本体は FlagGuesserPlayfield（SVG / Canvas 切替可）。
 */

import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import type { Locale } from "@/lib/i18n-constants";

countries.registerLocale(enLocale as countries.LocaleData);
countries.registerLocale(jaLocale as countries.LocaleData);

/**
 * ISO 3166-1 alpha-2（例: iso-3166.json の `"alpha-2"`）を、サイト言語に応じた国名に変換する。
 * - `locale === "ja"` → 日本語（i18n-iso-countries の ja）
 * - `locale === "en"` → 英語（en）
 *
 * 該当が無い場合は `undefined`（呼び出し側で ISO の `name` などにフォールバック）。
 */
export function getCountryDisplayName(alpha2: string | undefined | null, locale: Locale): string | undefined {
  const raw = alpha2?.trim();
  if (!raw) return undefined;
  const code = raw.toUpperCase();
  const lang = locale === "ja" ? "ja" : "en";
  return countries.getName(code, lang) ?? undefined;
}

export {
  formatMapDebugSnippet,
  screenToMapSpace,
  mapSpaceToScreen,
  type ZoomPlain,
  ZOOM_IDENTITY,
} from "@/lib/flag-guesser/viewportGeo";
