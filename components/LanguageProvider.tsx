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
  getBrowserLanguageStorage,
  isSupportedLocale,
  readStoredLanguage,
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
  setLocale: (locale: Locale, options?: SetLocaleOptions) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
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
      }
    },
    [],
  );

  // Applies the saved preference when it could not reach the server render
  // (e.g. the cookie was cleared but localStorage still has it) and re-syncs
  // the cookie so the next SSR matches. Runs after children mount, so an
  // explicit ?lang= override always wins.
  useEffect(() => {
    if (explicitOverride.current) {
      return;
    }

    const stored = readStoredLanguage(getBrowserLanguageStorage());

    if (stored && stored !== initialLocaleRef.current) {
      setLocaleState(stored);
      writeLanguageCookie(stored);
    }
  }, []);

  // Keeps <html lang> in sync for assistive technology and SEO.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, t: messages[locale], setLocale }),
    [locale, setLocale],
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
