"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, X } from "lucide-react";
import type { Address } from "viem";
import Image from "next/image";
import { useI18n } from "@/components/LanguageProvider";

const CIRCLE_FAUCET_URL = "https://faucet.circle.com";

type FundWalletModalProps = {
  walletAddress: Address;
  networkName: string;
  onDismiss: () => void;
};

function shortenAddress(address: string) {
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

export function FundWalletModal({
  walletAddress,
  networkName,
  onDismiss,
}: FundWalletModalProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useBodyScrollLock();

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopyState("copied");
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t.fund.modal.closeAria}
        onClick={onDismiss}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fund-wallet-title"
        tabIndex={-1}
        className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-purple-950/50 outline-none"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
          aria-label={t.common.close}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <div className="relative h-11 w-11 shrink-0">
            <Image
              src="/emotepay-logo.png"
              alt=""
              fill
              className="object-contain"
            />
          </div>
          <div>
            <h2 id="fund-wallet-title" className="text-xl font-black text-white">
              {t.fund.modal.title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {t.fund.modal.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t.fund.modal.embeddedWallet}
          </p>
          <p className="mt-2 font-mono text-sm font-semibold text-white">
            {shortenAddress(walletAddress)}
          </p>
          <p className="mt-2 break-all font-mono text-xs leading-relaxed text-slate-400">
            {walletAddress}
          </p>
          <button
            type="button"
            onClick={copyAddress}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-purple-400 hover:text-white"
          >
            {copyState === "copied" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Copy className="h-4 w-4 text-purple-300" />
            )}
            {copyState === "copied" ? t.common.copied : t.common.copyAddress}
          </button>
        </div>

        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
            <dt className="text-slate-400">{t.common.network}</dt>
            <dd className="font-semibold text-white">{networkName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
            <dt className="text-slate-400">{t.fund.modal.assetNeeded}</dt>
            <dd className="font-semibold text-white">{t.fund.modal.testUsdc}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <dt className="text-emerald-100/80">{t.common.gas}</dt>
            <dd className="font-semibold text-emerald-300">{t.common.sponsored}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-xl border border-purple-400/20 bg-purple-400/10 p-3 text-sm text-purple-100">
          {t.fund.modal.noMonNeeded}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <a
            href={CIRCLE_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-purple-500"
          >
            {t.fund.modal.openFaucet}
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={copyAddress}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm font-bold text-slate-200 transition-colors hover:border-purple-400 hover:text-white"
          >
            <Copy className="h-4 w-4" />
            {t.common.copyAddress}
          </button>
        </div>
      </div>
    </div>
  );
}
