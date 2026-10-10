"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { BarChart3, ExternalLink, RefreshCw } from "lucide-react";
import {
  fetchCreatorHistory,
  getCreatorHistoryAddress,
  getEnvioApiUrl,
  type CreatorHistory,
} from "@/lib/envio";
import { EMOTES } from "@/lib/emotes";
import { CreatorRoute } from "@/components/CreatorRoute";
import { useI18n } from "@/components/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { usePrivy } from "@privy-io/react-auth";

type HistoryErrorCode = "unconfigured" | "session" | "loadFailed";

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; history: CreatorHistory }
  | { status: "empty"; history: CreatorHistory }
  | { status: "unconfigured"; code: HistoryErrorCode }
  | { status: "error"; code: HistoryErrorCode };

const emotesByOnchainId = new Map(
  EMOTES.map((emote) => [BigInt(emote.onchainId).toString(), emote]),
);

function shortenValue(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUsdcAmount(amount: string) {
  const fullAmount = formatUnits(BigInt(amount), 6);
  const [whole, fraction = ""] = fullAmount.split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return `${trimmedFraction ? `${whole}.${trimmedFraction}` : whole} USDC`;
}

function CreatorContent() {
  const { t, locale } = useI18n();
  const { getAccessToken } = usePrivy();

  const getDonationTime = useCallback(
    (timestamp: string) => {
      const timestampSeconds = Number(timestamp);

      if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
        return t.creator.unknownTime;
      }

      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestampSeconds * 1000));
    },
    [locale, t],
  );
  const [historyState, setHistoryState] = useState<HistoryState>({
    status: "idle",
  });
  const envioApiUrl = getEnvioApiUrl();
  const creatorAddress = getCreatorHistoryAddress();

  const loadHistory = useCallback(async () => {
    if (!creatorAddress) {
      setHistoryState({ status: "unconfigured", code: "unconfigured" });
      return;
    }

    setHistoryState({ status: "loading" });

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setHistoryState({ status: "error", code: "session" });
        return;
      }

      const history = await fetchCreatorHistory({
        apiUrl: envioApiUrl,
        creatorAddress,
        accessToken,
      });

      setHistoryState(
        history.donations.length > 0
          ? { status: "ready", history }
          : { status: "empty", history },
      );
    } catch (error) {
      console.error("Failed to load Envio donation history", error);
      setHistoryState({ status: "error", code: "loadFailed" });
    }
  }, [creatorAddress, envioApiUrl, getAccessToken]);

  useEffect(() => {
    window.setTimeout(loadHistory, 0);
  }, [loadHistory]);

  const history =
    historyState.status === "ready" || historyState.status === "empty"
      ? historyState.history
      : null;
  const totalReceived = history?.stats?.totalAmountReceived ?? "0";
  const totalDonations = history?.stats?.totalDonationsCount ?? 0;
  const uniqueDonors = history?.stats?.uniqueDonorsCount ?? 0;

  const rows = useMemo(() => history?.donations ?? [], [history]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-300">
              <BarChart3 className="h-4 w-4" />
              {t.creator.badge}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t.creator.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={loadHistory}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={historyState.status === "loading"}
            >
              <RefreshCw className="h-4 w-4" />
              {t.creator.refresh}
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.creator.totalReceived}
            </div>
            <div className="mt-2 text-2xl font-black">
              {formatUsdcAmount(totalReceived)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.creator.donations}
            </div>
            <div className="mt-2 text-2xl font-black">{totalDonations}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.creator.uniqueDonors}
            </div>
            <div className="mt-2 text-2xl font-black">{uniqueDonors}</div>
          </div>
        </div>

        {historyState.status === "loading" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            {t.creator.loading}
          </div>
        )}

        {(historyState.status === "unconfigured" ||
          historyState.status === "error") && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
            {t.creator.errors[historyState.code]}
          </div>
        )}

        {historyState.status === "empty" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            {t.creator.empty}
          </div>
        )}

        {rows.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-[1fr_1fr_1fr_1fr]">
              <span>{t.creator.table.donation}</span>
              <span>{t.creator.table.donor}</span>
              <span className="hidden sm:block">{t.creator.table.block}</span>
              <span>{t.creator.table.tx}</span>
            </div>

            <div className="divide-y divide-slate-800">
              {rows.map((donation) => {
                const emote = emotesByOnchainId.get(donation.emoteId);

                return (
                  <div
                    key={donation.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-4 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl">{emote?.emoji ?? "?"}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-white">
                          {formatUsdcAmount(donation.amount)}
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {emote
                            ? (t.emotes[emote.id as keyof typeof t.emotes] ??
                              emote.name)
                            : t.creator.unknownEmote(donation.emoteId)}{" "}
                          · {getDonationTime(donation.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-xs text-slate-300">
                      {shortenValue(donation.donor)}
                    </div>
                    <div className="hidden font-mono text-xs text-slate-400 sm:block">
                      {donation.blockNumber}
                    </div>
                    <a
                      href={`https://testnet.monadexplorer.com/tx/${donation.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                    >
                      {shortenValue(donation.transactionHash)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default function CreatorPage() {
  return (
    <CreatorRoute>
      <CreatorContent />
    </CreatorRoute>
  );
}
