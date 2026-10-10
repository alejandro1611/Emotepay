import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { getRequestLocaleInfo } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getRequestLocaleInfo();
  const messages = getMessages(locale);

  return {
    title: messages.metadata.title,
    description: messages.metadata.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, hasSavedPreference } = await getRequestLocaleInfo();

  return (
    <html lang={locale}>
      <body>
        <Providers
          initialLocale={locale}
          initialSavedPreference={hasSavedPreference}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
