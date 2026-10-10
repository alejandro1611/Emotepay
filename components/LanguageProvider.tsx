"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  clearLanguageCookie,
  clearStoredLanguage,
  getBrowserLanguageStorage,
  isSupportedLocale,
  readStoredLanguage,
  resolveLocaleFromNavigator,
  writeLanguageCookie,
  writeStoredLanguage,
  type Locale,
} from "@/lib/i18n/locale";
import { messages, type Messages } from "@/lib/i18n/messages";

type SetLocaleOptions = {
  /**
   * Persist the choice to localStorage + cookie. The OBS overlay passes
   * `persist: false` for its ?lang= override so it does not rewrite the
   * viewer's saved preference.
   */
  persist?: boolean;
  /**
   * Marks the change as an explicit in-page override (e.g. ?lang= on the
   * overlay) that wins over the stored preference applied on mount.
   */
  override?: boolean;
};

type LanguageContextValue = {
  locale: Locale;
  t: Messages;
  /**
   * True when the user made an explicit language choice that is being
   * persisted (or will be once storage is reachable). Drives the optional
   * "use browser language" reset in settings.
   */
  hasManualPreference: boolean;
  setLocale: (locale: Locale, options?: SetLocaleOptions) => void;
  /**
   * Clears the saved manual preference (localStorage + cookie) and restores
   * automatic detection from the browser language.
   */
  clearLocale: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLocale,
  initialSavedPreference = false,
  children,
}: {
  initialLocale: Locale;
  /**
   * Whether the server saw a valid language cookie for this request. Kept as
   * a prop (instead of reading storage during render) so SSR and hydration
   * agree; a localStorage-only preference is picked up after mount.
   */
  initialSavedPreference?: boolean;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );
  const [hasManualPreference, setHasManualPreference] = useState(
    initialSavedPreference,
  );
  // Set when an in-page override (?lang=) must beat the stored preference.
  const explicitOverride = useRef(false);
  const initialLocaleRef = useRef(locale);

  const setLocale = useCallback(
    (next: Locale, options?: SetLocaleOptions) => {
      const persist = options?.persist !== false;

      if (options?.override) {
        explicitOverride.current = true;
      }

      setLocaleState(next);

      if (persist) {
        writeStoredLanguage(getBrowserLanguageStorage(), next);
        writeLanguageCookie(next);
        setHasManualPreference(true);
      }
    },
    [],
  );

  const clearLocale = useCallback(() => {
    clearStoredLanguage(getBrowserLanguageStorage());
    clearLanguageCookie();
    explicitOverride.current = false;
    setHasManualPreference(false);
    setLocaleState(resolveLocaleFromNavigator() ?? DEFAULT_LOCALE);
  }, []);

  // Applies the saved preference when it could not reach the server render
  // (e.g. the cookie was cleared but localStorage still has it) and re-syncs
  // the cookie so the next SSR matches. Deferred to a macrotask so hydration
  // finishes first; an explicit ?lang= override always wins.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (explicitOverride.current) {
        return;
      }

      const stored = readStoredLanguage(getBrowserLanguageStorage());

      if (stored) {
        setHasManualPreference(true);

        if (stored !== initialLocaleRef.current) {
          setLocaleState(stored);
          writeLanguageCookie(stored);
        }
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  // Keeps <html lang> in sync for assistive technology and SEO.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      t: messages[locale],
      hasManualPreference,
      setLocale,
      clearLocale,
    }),
    [locale, hasManualPreference, setLocale, clearLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n(): LanguageContextValue {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }

  return context;
}
