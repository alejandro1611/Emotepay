"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";

const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  network: "monad-testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cmuani71i00as0cjz92ai599v" // Reemplazá esto con tu App ID real de Privy
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#a855f7",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      {children}
    </PrivyProvider>
  );
}