"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import { monadTestnet } from "@/lib/chains";
import { LanguageProvider } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/i18n/locale";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({
  children,
  initialLocale,
  initialSavedPreference,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  initialSavedPreference?: boolean;
}) {
  const pathname = usePathname();
  // The OBS overlay renders without Privy (no auth needed there), but it
  // still gets the language context for its ?lang= override.
  const isOverlayBypass = Boolean(pathname?.startsWith("/overlay"));

  let content: React.ReactNode;

  if (!privyAppId) {
    if (isOverlayBypass) {
      content = children;
    } else {
      throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not configured");
    }
  } else {
    content = (
      <PrivyProvider
        appId={privyAppId}
        config={{
          appearance: {
            theme: "dark",
            accentColor: "#a855f7",
          },
          loginMethods: ["google", "email"],
          embeddedWallets: {
            ethereum: {
              createOnLogin: "users-without-wallets",
            },
          },
          defaultChain: monadTestnet,
          supportedChains: [monadTestnet],
        }}
      >
        {children}
      </PrivyProvider>
    );
  }

  return (
    <LanguageProvider
      initialLocale={initialLocale}
      initialSavedPreference={initialSavedPreference}
    >
      {content}
    </LanguageProvider>
  );
}
