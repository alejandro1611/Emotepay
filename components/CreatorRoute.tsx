"use client";

import React, { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

import { demoCreator } from "@/lib/creator";
import { isCreatorPrivyUser } from "@/lib/creator-identity";
import { useI18n } from "@/components/LanguageProvider";

export function CreatorRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, authenticated, user } = usePrivy();
  const isCreator =
    ready &&
    authenticated &&
    Boolean(user) &&
    isCreatorPrivyUser(user, demoCreator.walletAddress);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!authenticated) {
      router.replace("/login");
      return;
    }

    if (!isCreator) {
      router.replace("/");
    }
  }, [authenticated, isCreator, ready, router]);

  if (!ready || !authenticated || !isCreator) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-white">
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300"
        >
          <Loader2
            className="h-4 w-4 animate-spin text-purple-300 motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t.auth.route.verifyingCreator}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
