"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { CheckCircle2, Loader2, LogIn, LogOut, Wallet } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
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
      setError("No pudimos cerrar la sesión. Intentá nuevamente.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#080510] text-white selection:bg-purple-500">
      <div aria-hidden="true" className="bubble-background pointer-events-none absolute inset-0 overflow-hidden">
        <span className="bubble bubble-one" />
        <span className="bubble bubble-two" />
        <span className="bubble bubble-three" />
        <span className="bubble bubble-four" />
        <span className="bubble bubble-five" />
      </div>
      <section aria-labelledby="login-title" className="relative h-[75dvh] w-[75vw] overflow-y-auto rounded-3xl border border-purple-300/25 bg-[#160a30]/80 p-4 shadow-2xl sm:p-8 lg:p-12">
        <div className="login-entry mx-auto flex min-h-full w-full max-w-xl flex-col justify-center text-center">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/emotepay-logo.png" alt="" width={256} height={256} sizes="(min-width: 640px) 256px, 192px" priority className="h-[clamp(96px,20dvh,192px)] w-[clamp(96px,20dvh,192px)] max-w-full object-contain sm:h-[clamp(128px,24dvh,256px)] sm:w-[clamp(128px,24dvh,256px)]" />
          <span className="text-[clamp(2rem,8vw,3rem)] font-black tracking-tight sm:text-6xl">Emote<span className="text-purple-400">Pay</span></span>
        </div>

        <h1 id="login-title" className="text-3xl font-black tracking-tight">
          {ready && authenticated ? "Ingresando…" : "Bienvenido a EmotePay"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-purple-100">
          {ready && authenticated
            ? "Tu sesión está lista. Te llevamos al inicio."
            : "Continuá con Google o email."}
        </p>

        {!ready ? (
          <div role="status" className="mt-8 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Preparando el acceso…
          </div>
        ) : authenticated ? (
          <div className="mt-8 space-y-4">
            <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Sesión iniciada
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!walletsReady || !embeddedWallet ? "Preparando tu wallet…" : "Tu wallet está lista"}
              </div>
              {walletsReady && embeddedWallet && (
                <p className="mt-2 break-all font-mono text-xs text-slate-400">{embeddedWallet.address}</p>
              )}
            </div>
            <button type="button" onClick={handleLogout} disabled={isLoggingOut} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold transition hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50">
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
              {isLoggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <button type="button" onClick={openLogin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-purple-950 transition hover:bg-purple-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-200">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Iniciar sesión
            </button>
            <p className="text-center text-sm leading-5 text-purple-100">
               Si es tu primera vez, se crea tu cuenta al continuar.
            </p>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}</p>}
        <p className="mt-6 border-t border-purple-300/20 pt-5 text-sm leading-5 text-purple-100">Los pagos usan MON en Monad Testnet. Iniciar sesión no realiza ningún pago.</p>
        <ul aria-label="Plataformas de streaming" className="mt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          {[
            { name: "Kick", logo: "/kick.svg" },
            { name: "Twitch", logo: "/twitch.svg" },
            { name: "Facebook", logo: "/facebook.svg" },
            { name: "TikTok", logo: "/tiktok.svg" },
            { name: "YouTube", logo: "/youtube.svg" },
          ].map((platform) => (
            <li key={platform.name}>
              <Image src={platform.logo} alt={platform.name} title={platform.name} width={36} height={36} className="h-9 w-9 object-contain brightness-0 invert" />
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
          --size: 36vmax; --duration: 24s; --delay: -8s;
          --x: 28vw; --y: 20vh;
          top: -12%; left: -10%;
        }
        .bubble-two {
          --size: 42vmax; --duration: 32s; --delay: -16s;
          --x: -30vw; --y: 28vh;
          top: -25%; right: -14%;
        }
        .bubble-three {
          --size: 34vmax; --duration: 28s; --delay: -5s;
          --x: 32vw; --y: -24vh;
          bottom: -20%; left: -12%;
          background: linear-gradient(145deg, #b244ff, #7924d5 65%, #541092);
        }
        .bubble-four {
          --size: 46vmax; --duration: 36s; --delay: -20s;
          --x: -25vw; --y: -22vh;
          bottom: -30%; right: -15%;
          background: linear-gradient(145deg, #7221d9, #c651f5);
        }
        .bubble-five {
          --size: 12vmax; --duration: 22s; --delay: -11s;
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
      `}</style>
    </main>
  );
}
