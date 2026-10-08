"use client";

import React, { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, ready, router]);

  if (!ready || !authenticated) {
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
          Preparando EmotePay...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
