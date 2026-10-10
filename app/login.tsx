"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { CheckCircle2, Loader2, LogIn, LogOut, Wallet } from "lucide-react";
import { useI18n } from "@/components/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, authenticated, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);

  const embeddedWallet = wallets.find(
    (wallet) =>
      wallet.type === "ethereum" &&
      (wallet.walletClientType === "privy" ||
        wallet.walletClientType === "privy-v2"),
  );

  function openLogin() {
    setError(null);
    login({ loginMethods: ["google", "email"] });
  }

  async function handleLogout() {
    setError(null);
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      setError(t.auth.logoutError);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="relative isolate flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-[#080510] p-[clamp(0.75rem,2.5dvw,2rem)] text-white selection:bg-purple-500">
      <div aria-hidden="true" className="bubble-background pointer-events-none absolute inset-0 overflow-hidden">
        <span className="bubble bubble-one" />
        <span className="bubble bubble-two" />
        <span className="bubble bubble-three" />
        <span className="bubble bubble-four" />
        <span className="bubble bubble-five" />
      </div>
      <div className="absolute right-[clamp(0.75rem,2.5dvw,2rem)] top-[clamp(0.75rem,2.5dvw,2rem)]">
        <LanguageSwitcher />
      </div>
      <section aria-labelledby="login-title" className="relative w-[min(100%,32rem)] overflow-hidden rounded-3xl border border-purple-300/25 bg-[#160a30]/80 p-[clamp(1rem,3dvh,2.25rem)] shadow-2xl backdrop-blur-sm">
        <div className="login-entry mx-auto flex w-full max-w-md flex-col justify-center text-center">
        <div className="login-brand mb-[clamp(0.75rem,2.4dvh,1.5rem)] flex flex-col items-center gap-[clamp(0.35rem,1.4dvh,0.75rem)] text-center">
          <Image src="/emotepay-logo.png" alt="" width={256} height={256} sizes="(min-width: 640px) 160px, 112px" priority className="h-[clamp(4.25rem,16dvh,9rem)] w-[clamp(4.25rem,16dvh,9rem)] max-w-full object-contain" />
          <span className="text-[clamp(1.9rem,8vw,3.5rem)] font-black leading-none tracking-tight">Emote<span className="text-purple-400">Pay</span></span>
        </div>

        <h1 id="login-title" className="text-[clamp(1.35rem,4.8vw,1.875rem)] font-black leading-tight tracking-tight">
          {ready && authenticated
            ? t.auth.login.entering
            : t.auth.login.welcomeTitle}
        </h1>
        <p className="mt-[clamp(0.35rem,1.4dvh,0.75rem)] text-sm leading-5 text-purple-100">
          {ready && authenticated
            ? t.auth.login.sessionReadySubtitle
            : t.auth.login.subtitle}
        </p>

        {!ready ? (
          <div role="status" className="mt-[clamp(0.9rem,2.7dvh,2rem)] flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300 sm:p-4">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t.auth.login.preparingAccess}
          </div>
        ) : authenticated ? (
          <div className="mt-[clamp(0.9rem,2.7dvh,2rem)] space-y-[clamp(0.65rem,1.8dvh,1rem)]">
            <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 sm:p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                {t.auth.login.sessionStarted}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!walletsReady || !embeddedWallet
                  ? t.auth.login.preparingWallet
                  : t.auth.login.walletReady}
              </div>
              {walletsReady && embeddedWallet && (
                <p className="mt-2 break-all font-mono text-xs text-slate-400">{embeddedWallet.address}</p>
              )}
            </div>
            <button type="button" onClick={handleLogout} disabled={isLoggingOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold transition hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50">
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
              {isLoggingOut ? t.auth.loggingOut : t.auth.logOut}
            </button>
          </div>
        ) : (
          <div className="mt-[clamp(0.9rem,2.7dvh,2rem)] space-y-[clamp(0.55rem,1.5dvh,0.75rem)]">
            <button type="button" onClick={openLogin} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-purple-950 transition hover:bg-purple-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-200 sm:py-3.5">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t.auth.login.signIn}
            </button>
            <p className="text-center text-sm leading-5 text-purple-100">
               {t.auth.login.firstTimeHint}
            </p>
          </div>
        )}

        {error && <p role="alert" className="mt-[clamp(0.6rem,1.8dvh,1rem)] rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}</p>}
        <p className="mt-[clamp(0.85rem,2.4dvh,1.5rem)] border-t border-purple-300/20 pt-[clamp(0.75rem,2dvh,1.25rem)] text-sm leading-5 text-purple-100">{t.auth.login.footerNote}</p>
        <ul aria-label={t.auth.login.platformsLabel} className="mt-[clamp(0.85rem,2.4dvh,2rem)] flex flex-wrap items-center justify-center gap-[clamp(0.9rem,4vw,2rem)]">
          {[
            { name: "Kick", logo: "/kick.svg" },
            { name: "Twitch", logo: "/twitch.svg" },
            { name: "Facebook", logo: "/facebook.svg" },
            { name: "TikTok", logo: "/tiktok.svg" },
            { name: "YouTube", logo: "/youtube.svg" },
          ].map((platform) => (
            <li key={platform.name}>
              <Image src={platform.logo} alt={platform.name} title={platform.name} width={36} height={36} className="h-[clamp(1.55rem,6vw,2.25rem)] w-[clamp(1.55rem,6vw,2.25rem)] object-contain brightness-0 invert" />
            </li>
          ))}
        </ul>
        </div>
      </section>
      <style jsx>{`
        .bubble-background {
          background: linear-gradient(145deg, #16052f 0%, #341078 55%, #18082e 100%);
        }
        .bubble {
          position: absolute;
          width: var(--size);
          height: var(--size);
          border-radius: 50%;
          background: linear-gradient(145deg, #9200ff, #5400ce 60%, #350b78);
          opacity: 0.85;
          animation: bubble-drift var(--duration) ease-in-out infinite alternate;
          animation-delay: var(--delay);
        }
        .bubble-one {
          --size: clamp(14rem, 36vmax, 32rem); --duration: 24s; --delay: -8s;
          --x: 28vw; --y: 20vh;
          top: -12%; left: -10%;
        }
        .bubble-two {
          --size: clamp(16rem, 42vmax, 38rem); --duration: 32s; --delay: -16s;
          --x: -30vw; --y: 28vh;
          top: -25%; right: -14%;
        }
        .bubble-three {
          --size: clamp(13rem, 34vmax, 30rem); --duration: 28s; --delay: -5s;
          --x: 32vw; --y: -24vh;
          bottom: -20%; left: -12%;
          background: linear-gradient(145deg, #b244ff, #7924d5 65%, #541092);
        }
        .bubble-four {
          --size: clamp(16rem, 46vmax, 40rem); --duration: 36s; --delay: -20s;
          --x: -25vw; --y: -22vh;
          bottom: -30%; right: -15%;
          background: linear-gradient(145deg, #7221d9, #c651f5);
        }
        .bubble-five {
          --size: clamp(4rem, 12vmax, 9rem); --duration: 22s; --delay: -11s;
          --x: 40vw; --y: -38vh;
          bottom: 4%; left: 20%;
          background: linear-gradient(145deg, #e597ff, #9632e3);
        }
        @keyframes bubble-drift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(var(--x), var(--y), 0); }
        }
        .login-entry {
          animation: login-enter 250ms ease-out both;
        }
        @keyframes login-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-entry, .bubble { animation: none; }
        }
        @media (max-height: 640px) {
          .login-brand {
            margin-bottom: 0.5rem;
          }
          .bubble-five {
            display: none;
          }
        }
        @media (max-height: 580px) {
          .bubble-three,
          .bubble-four {
            opacity: 0.45;
          }
        }
      `}</style>
    </main>
  );
}
