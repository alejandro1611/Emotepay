export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LANGUAGE_PREFERENCE_VERSION = 1;
export const LANGUAGE_STORAGE_KEY = `emotepay:language:v${LANGUAGE_PREFERENCE_VERSION}`;
// Cookie names cannot contain ":" (RFC 6265 separators), so the cookie uses
// underscores while localStorage keeps the namespaced key.
export const LANGUAGE_COOKIE_NAME = `emotepay_language_v${LANGUAGE_PREFERENCE_VERSION}`;
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type LanguageStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es";
}

/**
 * Normalizes a locale tag to a supported locale. Regional variants collapse to
 * their base language ("es-AR"/"es-MX" -> "es", "en-US"/"en-GB" -> "en") and
 * unsupported languages return null so callers can apply the fallback chain.
 */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }

  const base = value.trim().toLowerCase().split(/[-_]/)[0];

  return isSupportedLocale(base) ? base : null;
}

/**
 * Parses an Accept-Language header into tags ordered by descending quality.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const quality = qParam ? Number(qParam.trim().slice(2)) : 1;

      return {
        tag: tag.trim(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/**
 * First supported language in the Accept-Language preference order, or null.
 */
export function resolveLocaleFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  for (const tag of parseAcceptLanguage(header)) {
    const locale = normalizeLocale(tag);

    if (locale) {
      return locale;
    }
  }

  return null;
}

/**
 * Resolves the browser locale from navigator.languages / navigator.language.
 * Safe to call on the server (returns null).
 */
export function resolveLocaleFromNavigator(): Locale | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const tag of candidates) {
    const locale = normalizeLocale(tag);

    if (locale) {
      return locale;
    }
  }

  return null;
}

export function readStoredLanguage(
  storage: LanguageStorage | null | undefined,
): Locale | null {
  if (!storage) {
    return null;
  }

  try {
    return normalizeLocale(storage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredLanguage(
  storage: LanguageStorage | null | undefined,
  locale: Locale,
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Language switching must keep working when localStorage is blocked.
  }
}

export function clearStoredLanguage(
  storage: LanguageStorage | null | undefined,
) {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // Clearing must keep working when localStorage is blocked.
  }
}

export function getBrowserLanguageStorage(): LanguageStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Initial locale resolution priority:
 *   1. Explicitly saved user preference.
 *   2. Browser language (Accept-Language header or navigator).
 *   3. English fallback.
 */
export function resolveInitialLocale({
  storedLanguage,
  acceptLanguage,
}: {
  storedLanguage?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return (
    normalizeLocale(storedLanguage) ??
    resolveLocaleFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

/**
 * Parses an explicit ?lang= override (used by the OBS overlay, which may not
 * share browser storage with the viewer's browser).
 */
export function normalizeLanguageParam(
  value: string | null | undefined,
): Locale | null {
  return normalizeLocale(value);
}

export function writeLanguageCookie(locale: Locale) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${LANGUAGE_COOKIE_NAME}=${locale};path=/;max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS};samesite=lax`;
}

export function clearLanguageCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${LANGUAGE_COOKIE_NAME}=;path=/;max-age=0;samesite=lax`;
}
