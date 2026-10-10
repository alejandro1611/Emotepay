"use client";

import { useState } from "react";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { LogoutConfirmationModal } from "@/components/LogoutConfirmationModal";

export function AuthButton() {
  const router = useRouter();
  const { ready, authenticated, login, logout } = usePrivy();
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleConfirmLogout() {
    if (isLoggingOut) {
      return;
    }

    setLogoutError(null);
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("No pudimos cerrar la sesión. Intentá nuevamente.");
      setIsLoggingOut(false);
    }
  }

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-500 transition-all"
        aria-label="Loading auth"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={() => login({ loginMethods: ["google", "email"] })}
        className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-slate-200 transition-all hover:border-purple-500/50 hover:text-white"
      >
        <LogIn className="h-4 w-4" />
        Log in
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isLoggingOut}
        onClick={() => {
          setLogoutError(null);
          setIsConfirmingLogout(true);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition-all hover:border-purple-500/50 hover:text-white disabled:opacity-60"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut className="h-4 w-4" />
      </button>
      {isConfirmingLogout && (
        <LogoutConfirmationModal
          isLoggingOut={isLoggingOut}
          error={logoutError}
          onCancel={() => {
            if (!isLoggingOut) {
              setIsConfirmingLogout(false);
              setLogoutError(null);
            }
          }}
          onConfirm={handleConfirmLogout}
        />
      )}
    </>
  );
}
