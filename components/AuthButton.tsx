"use client";

import { useMemo, useState } from "react";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

function shortenAddress(address?: string) {
  if (!address) {
    return "Wallet pending";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuthButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const embeddedWalletAddress = useMemo(() => {
    const connectedEmbeddedWallet = wallets.find(
      (wallet) =>
        wallet.walletClientType === "privy" ||
        wallet.walletClientType === "privy-v2",
    );

    if (connectedEmbeddedWallet) {
      return connectedEmbeddedWallet.address;
    }

    for (const account of user?.linkedAccounts ?? []) {
      if (
        account.type === "wallet" &&
        (account.walletClientType === "privy" ||
          account.walletClientType === "privy-v2")
      ) {
        return account.address;
      }
    }

    return undefined;
  }, [user?.linkedAccounts, wallets]);

  const fallbackWallet = wallets[0] ?? user?.wallet;
  const walletAddress = embeddedWalletAddress ?? fallbackWallet?.address;
  const walletStatus = embeddedWalletAddress
    ? "Embedded wallet ready"
    : "Wallet pending";

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 transition-all flex items-center gap-2"
      >
        Loading auth...
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={() => login({ loginMethods: ["google", "email"] })}
        className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center gap-2"
      >
        <LogIn className="w-4 h-4" />
        Log in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-xs font-semibold text-emerald-300">
          Authenticated
        </span>
        <span className="text-[11px] text-slate-400">
          {walletsReady ? walletStatus : "Loading wallet..."}
        </span>
      </div>
      <div className="text-sm font-medium px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
        <Wallet className="w-4 h-4 text-purple-400" />
        <span>{shortenAddress(walletAddress)}</span>
      </div>
      <button
        type="button"
        disabled={isLoggingOut}
        onClick={async () => {
          setIsLoggingOut(true);
          await logout();
          setIsLoggingOut(false);
        }}
        className="text-sm font-medium p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 disabled:opacity-60 transition-all"
        aria-label="Log out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
