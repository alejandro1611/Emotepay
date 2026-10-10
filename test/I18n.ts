import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCALE,
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  clearStoredLanguage,
  normalizeLanguageParam,
  normalizeLocale,
  parseAcceptLanguage,
  readStoredLanguage,
  resolveInitialLocale,
  resolveLocaleFromAcceptLanguage,
  writeStoredLanguage,
  type LanguageStorage,
} from "../lib/i18n/locale";
import { en } from "../lib/i18n/messages/en";
import { es } from "../lib/i18n/messages/es";
import { messages } from "../lib/i18n/messages";
import {
  ONBOARDING_TOUR_STORAGE_KEY,
  readOnboardingTourStatus,
  writeOnboardingTourStatus,
} from "../lib/onboarding-tour";
import { renderPaymentError } from "../lib/payment-errors";

function createMemoryStorage(): LanguageStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function flattenLeaves(value: unknown, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();

  if (typeof value === "string" || typeof value === "function") {
    entries.set(prefix, typeof value);
    return entries;
  }

  assert.equal(typeof value, "object", `${prefix} must be a leaf or object`);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    for (const [path, type] of flattenLeaves(
      child,
      prefix ? `${prefix}.${key}` : key,
    )) {
      entries.set(path, type);
    }
  }

  return entries;
}

describe("locale normalization", function () {
  it("maps Spanish regional variants to es", function () {
    for (const tag of ["es-AR", "es-ES", "es-MX", "es", "ES-419", "es_ar"]) {
      assert.equal(normalizeLocale(tag), "es", tag);
    }
  });

  it("maps English regional variants to en", function () {
    for (const tag of ["en-US", "en-GB", "en", "EN-au"]) {
      assert.equal(normalizeLocale(tag), "en", tag);
    }
  });

  it("returns null for unsupported languages and empty input", function () {
    for (const tag of ["fr", "fr-FR", "pt-BR", "de", "zh-CN", ""]) {
      assert.equal(normalizeLocale(tag), null, tag);
    }
    assert.equal(normalizeLocale(null), null);
    assert.equal(normalizeLocale(undefined), null);
  });

  it("normalizes the ?lang= override with the same rules", function () {
    assert.equal(normalizeLanguageParam("es"), "es");
    assert.equal(normalizeLanguageParam("es-MX"), "es");
    assert.equal(normalizeLanguageParam("en"), "en");
    assert.equal(normalizeLanguageParam("fr"), null);
    assert.equal(normalizeLanguageParam(null), null);
    assert.equal(normalizeLanguageParam("../admin"), null);
  });
});

describe("accept-language parsing", function () {
  it("orders candidates by descending quality", function () {
    assert.deepEqual(
      parseAcceptLanguage("fr-FR;q=0.9,es-MX;q=0.8,en-US;q=0.5"),
      ["fr-FR", "es-MX", "en-US"],
    );
  });

  it("defaults missing q values to 1", function () {
    assert.deepEqual(parseAcceptLanguage("es-ES,en;q=0.9"), ["es-ES", "en"]);
  });

  it("skips unsupported languages and picks the first supported tag", function () {
    assert.equal(
      resolveLocaleFromAcceptLanguage("fr-FR,es-AR;q=0.9,en;q=0.8"),
      "es",
    );
    assert.equal(resolveLocaleFromAcceptLanguage("fr-FR,de-DE"), null);
    assert.equal(resolveLocaleFromAcceptLanguage(""), null);
    assert.equal(resolveLocaleFromAcceptLanguage(null), null);
  });
});

describe("initial locale resolution priority", function () {
  it("prefers a stored preference over the browser language", function () {
    assert.equal(
      resolveInitialLocale({
        storedLanguage: "en",
        acceptLanguage: "es-MX,es;q=0.9",
      }),
      "en",
    );
    assert.equal(
      resolveInitialLocale({
        storedLanguage: "es",
        acceptLanguage: "en-US,en;q=0.9",
      }),
      "es",
    );
  });

  it("falls back to the browser language when nothing is stored", function () {
    assert.equal(
      resolveInitialLocale({ acceptLanguage: "es-ES,es;q=0.9" }),
      "es",
    );
    assert.equal(resolveInitialLocale({ acceptLanguage: "en-GB" }), "en");
  });

  it("ignores invalid stored values and uses the browser language", function () {
    assert.equal(
      resolveInitialLocale({
        storedLanguage: "fr",
        acceptLanguage: "es-AR",
      }),
      "es",
    );
  });

  it("falls back to English for unsupported input", function () {
    assert.equal(
      resolveInitialLocale({
        storedLanguage: "zh",
        acceptLanguage: "fr-FR,de;q=0.8",
      }),
      DEFAULT_LOCALE,
    );
    assert.equal(resolveInitialLocale({}), "en");
  });

  it("is deterministic for identical inputs (hydration-safe)", function () {
    const input = { storedLanguage: "es", acceptLanguage: "en-US" };

    assert.equal(resolveInitialLocale(input), resolveInitialLocale(input));
  });
});

describe("language preference persistence", function () {
  it("stores the selection under the versioned key", function () {
    assert.equal(LANGUAGE_STORAGE_KEY, "emotepay:language:v1");
    assert.equal(LANGUAGE_COOKIE_NAME, "emotepay_language_v1");

    const storage = createMemoryStorage();
    writeStoredLanguage(storage, "es");

    assert.equal(storage.values.get(LANGUAGE_STORAGE_KEY), "es");
    assert.equal(readStoredLanguage(storage), "es");
  });

  it("rejects unsupported persisted values", function () {
    const storage = createMemoryStorage();
    storage.setItem(LANGUAGE_STORAGE_KEY, "fr");

    assert.equal(readStoredLanguage(storage), null);
  });

  it("tolerates missing or throwing storage", function () {
    assert.equal(readStoredLanguage(null), null);
    assert.equal(readStoredLanguage(undefined), null);

    const throwingStorage: LanguageStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    assert.equal(readStoredLanguage(throwingStorage), null);
    writeStoredLanguage(throwingStorage, "es");
    clearStoredLanguage(throwingStorage);
  });

  it("clears the saved preference so detection falls back to the browser", function () {
    const storage = createMemoryStorage();
    writeStoredLanguage(storage, "es");
    assert.equal(readStoredLanguage(storage), "es");

    clearStoredLanguage(storage);
    assert.equal(readStoredLanguage(storage), null);
    assert.equal(storage.values.has(LANGUAGE_STORAGE_KEY), false);

    // After clearing, resolution behaves as if no manual preference exists:
    // the browser language wins again.
    assert.equal(
      resolveInitialLocale({
        storedLanguage: readStoredLanguage(storage),
        acceptLanguage: "es-MX,es;q=0.9",
      }),
      "es",
    );
    assert.equal(
      resolveInitialLocale({
        storedLanguage: readStoredLanguage(storage),
        acceptLanguage: "en-US",
      }),
      "en",
    );
  });

  it("clearing is idempotent and safe without storage", function () {
    const storage = createMemoryStorage();
    clearStoredLanguage(storage);
    clearStoredLanguage(null);
    clearStoredLanguage(undefined);

    writeStoredLanguage(storage, "en");
    clearStoredLanguage(storage);
    clearStoredLanguage(storage);
    assert.equal(readStoredLanguage(storage), null);
  });
});

describe("message dictionary completeness", function () {
  it("exposes a catalog for every supported locale", function () {
    assert.deepEqual(Object.keys(messages).sort(), ["en", "es"]);
  });

  it("the Spanish catalog covers every English key with matching types", function () {
    const englishLeaves = flattenLeaves(en);
    const spanishLeaves = flattenLeaves(es);

    const missing = [...englishLeaves.keys()].filter(
      (key) => !spanishLeaves.has(key),
    );
    assert.deepEqual(missing, [], "missing Spanish translations");

    const extra = [...spanishLeaves.keys()].filter(
      (key) => !englishLeaves.has(key),
    );
    assert.deepEqual(extra, [], "extra Spanish keys not present in English");

    for (const [key, type] of englishLeaves) {
      assert.equal(
        spanishLeaves.get(key),
        type,
        `${key} must have the same leaf type in both catalogs`,
      );
    }
  });

  it("no message is an empty string", function () {
    function assertNoEmptyStrings(value: unknown, path: string) {
      if (typeof value === "string") {
        assert.notEqual(value.trim(), "", `${path} must not be empty`);
        return;
      }

      if (typeof value === "function") {
        return;
      }

      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        assertNoEmptyStrings(child, `${path}.${key}`);
      }
    }

    for (const [locale, catalog] of Object.entries(messages)) {
      assertNoEmptyStrings(catalog, locale);
    }
  });

  it("renders payment UI messages in both locales", function () {
    for (const catalog of [en, es]) {
      assert.notEqual(
        renderPaymentError(catalog, { code: "insufficient-usdc" }),
        "",
      );
      assert.match(
        renderPaymentError(catalog, {
          code: "insufficient-usdc-amount",
          amountLabel: "0.10 USDC",
        }),
        /0\.10 USDC/,
      );
    }
  });
});

describe("localized formatting", function () {
  it("formats timestamps differently per locale", function () {
    const date = new Date(Date.UTC(2025, 0, 15, 18, 30));
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    const english = new Intl.DateTimeFormat("en", options).format(date);
    const spanish = new Intl.DateTimeFormat("es", options).format(date);

    assert.notEqual(english, spanish);
    assert.match(english, /Jan/);
    assert.match(spanish, /ene/);
  });
});

describe("onboarding persistence across locales", function () {
  it("keeps the completed state in a locale-independent key", function () {
    assert.equal(ONBOARDING_TOUR_STORAGE_KEY, "emotepay:onboarding:v1");
    assert.notEqual(ONBOARDING_TOUR_STORAGE_KEY, LANGUAGE_STORAGE_KEY);
  });

  it("survives a simulated language switch without resetting", function () {
    const storage = createMemoryStorage();
    writeOnboardingTourStatus(storage, "completed");
    writeStoredLanguage(storage, "es");

    assert.equal(readOnboardingTourStatus(storage), "completed");
    assert.equal(readStoredLanguage(storage), "es");

    writeStoredLanguage(storage, "en");
    assert.equal(readOnboardingTourStatus(storage), "completed");
  });
});
