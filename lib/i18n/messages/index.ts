import type { Locale } from "@/lib/i18n/locale";
import { en, type Messages } from "./en";
import { es } from "./es";

export const messages: Record<Locale, Messages> = { en, es };

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

export { en, es };
export type { Messages };
