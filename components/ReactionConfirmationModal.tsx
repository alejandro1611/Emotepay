"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { Address } from "viem";
import type { Emote } from "@/lib/emotes";

export type ConfirmationPhase =
  | "review"
  | "signing"
  | "sending"
  | "delivered"
  | "failed";

export type ReactionConfirmationModalProps = {
  phase: ConfirmationPhase;
  emote: Emote;
  amountLabel: string;
  creatorName: string;
  creatorAddress: Address | null;
  contractAddress: Address | null;
  usdcAddress: Address;
  networkName: string;
  chainId: number;
  authorizationValiditySeconds: number;
  errorMessage?: string;
  notice?: string;
  onConfirm: () => void;
  onDismiss: () => void;
};

function shortenAddress(address?: string | null) {
  if (!address) {
    return "Unavailable";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function useBodyScrollLock() {
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      overscrollBehavior: body.style.overscrollBehavior,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
      body.style.overscrollBehavior = previous.overscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-300">{value}</dd>
    </div>
  );
}

export function ReactionConfirmationModal({
  phase,
  emote,
  amountLabel,
  creatorName,
  creatorAddress,
  contractAddress,
  usdcAddress,
  networkName,
  chainId,
  authorizationValiditySeconds,
  errorMessage,
  notice,
  onConfirm,
  onDismiss,
}: ReactionConfirmationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const canDismiss =
    phase === "review" || phase === "failed" || phase === "delivered";

  useBodyScrollLock();

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!canDismiss) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canDismiss, onDismiss]);

  const showReviewDetails = phase === "review" || phase === "failed";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onMouseDown={canDismiss ? onDismiss : undefined}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm touch-none"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaction-confirmation-title"
        tabIndex={-1}
        className="relative w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-purple-950/50 outline-none"
      >
        <p
          id="reaction-confirmation-title"
          className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          {phase === "delivered" ? "Reaction delivered" : "You’re sending"}
        </p>

        <div className="mt-4 flex flex-col items-center text-center">
          <span aria-hidden="true" className="text-5xl leading-none">
            {emote.emoji}
          </span>
          <p className="mt-3 text-lg font-bold text-white">{emote.name}</p>
          <p className="mt-1 text-3xl font-black text-white">{amountLabel}</p>
        </div>

        {showReviewDetails && (
          <>
            <dl className="mt-5 divide-y divide-slate-800/70 rounded-xl border border-slate-800 bg-slate-950/70">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500">To</dt>
                <dd className="text-right text-sm font-semibold text-white">
                  {creatorName}
                  <span className="block font-mono text-[11px] font-normal text-slate-500">
                    {shortenAddress(creatorAddress)}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500">Network</dt>
                <dd className="text-sm font-semibold text-white">Monad</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500">Gas</dt>
                <dd className="text-sm font-semibold text-emerald-300">
                  Sponsored
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-center text-xs text-slate-400">
              You do not need MON.
            </p>
          </>
        )}

        {notice && phase === "review" && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            {notice}
          </div>
        )}

        {phase === "review" && (
          <div className="mt-5">
            {/* El accent de la reacción es un hex dinámico: el degradado va en
                estilos en línea porque Tailwind no genera clases en runtime. */}
            <button
              type="button"
              onClick={onConfirm}
              style={{
                backgroundImage: `linear-gradient(to right, ${emote.accent}, ${emote.accent}b3)`,
              }}
              className="w-full rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01] hover:opacity-95 active:scale-[0.99]"
            >
              Confirm &amp; Send
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {(phase === "signing" || phase === "sending") && (
          <div
            role="status"
            className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4"
          >
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-purple-300" />
            <div>
              <p className="text-sm font-bold text-white">
                {phase === "signing" ? "Signing…" : "Sending reaction…"}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {phase === "signing"
                  ? "Authorizing the exact amount above."
                  : "Delivering it to the stream."}
              </p>
            </div>
          </div>
        )}

        {phase === "delivered" && (
          <div className="mt-5">
            <div
              role="status"
              className="flex items-center justify-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
              <p className="text-sm font-bold text-white">
                Your reaction is on its way to the stream.
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950/60 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
            >
              Done
            </button>
          </div>
        )}

        {phase === "failed" && (
          <div className="mt-5">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <p className="text-sm text-amber-100">
                {errorMessage ??
                  "We could not send that reaction. Please try again."}
              </p>
            </div>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                backgroundImage: `linear-gradient(to right, ${emote.accent}, ${emote.accent}b3)`,
              }}
              className="mt-3 w-full rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01] hover:opacity-95 active:scale-[0.99]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {showReviewDetails && (
          <details className="group mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-slate-400">
              Technical details
              <span className="text-[11px] text-slate-600 group-open:hidden">
                Show
              </span>
              <span className="hidden text-[11px] text-slate-600 group-open:inline">
                Hide
              </span>
            </summary>
            <dl className="mt-3 grid grid-cols-1 gap-2.5 text-[11px]">
              <DetailRow
                label="Creator"
                value={shortenAddress(creatorAddress)}
              />
              <DetailRow
                label="EmotePay contract"
                value={shortenAddress(contractAddress)}
              />
              <DetailRow label="USDC token" value={shortenAddress(usdcAddress)} />
              <DetailRow
                label="Network"
                value={`${networkName} (${chainId})`}
              />
              <DetailRow
                label="Authorization"
                value={`Valid ${Math.round(authorizationValiditySeconds / 60)} min after confirm`}
              />
            </dl>
          </details>
        )}
      </div>
    </div>
  );
}
