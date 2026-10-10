import "server-only";

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LANGUAGE_COOKIE_NAME,
  normalizeLocale,
  resolveLocaleFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n/locale";

/**
 * Resolves the locale for the current request on the server:
 *   1. Explicit preference saved in the language cookie.
 *   2. Accept-Language header.
 *   3. English fallback.
 *
 * Reading request data makes routes that use it dynamic, which is required
 * anyway to render the correct language on first paint without flashes.
 */
export async function getRequestLocale(): Promise<Locale> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const stored = normalizeLocale(
    cookieStore.get(LANGUAGE_COOKIE_NAME)?.value,
  );

  return (
    stored ??
    resolveLocaleFromAcceptLanguage(headerStore.get("accept-language")) ??
    DEFAULT_LOCALE
  );
}
