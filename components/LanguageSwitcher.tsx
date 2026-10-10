"use client";

import { SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { useI18n } from "@/components/LanguageProvider";

const LOCALE_LABELS = {
  en: "EN",
  es: "ES",
} as const;

/**
 * Compact segmented EN/ES control. It never reloads the page: the locale is
 * held in context, persisted to localStorage + a cookie, and the wallet keeps
 * its session.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const localeNames = {
    en: t.language.english,
    es: t.language.spanish,
  } as const;

  return (
    <div
      role="group"
      aria-label={t.language.switcherLabel}
      className={`inline-flex h-11 shrink-0 items-center gap-0.5 rounded-xl border border-slate-800 bg-slate-900 p-1 ${className}`}
    >
      {SUPPORTED_LOCALES.map((option) => {
        const isActive = option === locale;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            aria-label={localeNames[option]}
            onClick={() => {
              if (!isActive) {
                setLocale(option);
              }
            }}
            className={`flex h-full min-w-9 items-center justify-center rounded-lg px-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-purple-400 sm:min-w-10 sm:px-2 ${
              isActive
                ? "bg-purple-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {LOCALE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
