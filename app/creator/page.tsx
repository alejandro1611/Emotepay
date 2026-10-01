"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { BarChart3, ExternalLink, RefreshCw } from "lucide-react";
import {
  fetchCreatorHistory,
  getCreatorHistoryAddress,
  getEnvioApiUrl,
  type CreatorHistory,
} from "@/lib/envio";
import { EMOTES } from "@/lib/emotes";

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; history: CreatorHistory }
  | { status: "empty"; history: CreatorHistory }
  | { status: "unconfigured"; reason: string }
  | { status: "error"; reason: string };

const emotesByOnchainId = new Map(
  EMOTES.map((emote) => [BigInt(emote.onchainId).toString(), emote]),
);

function shortenValue(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatMonAmount(amount: string) {
  const fullAmount = formatEther(BigInt(amount));
  const [whole, fraction = ""] = fullAmount.split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return `${trimmedFraction ? `${whole}.${trimmedFraction}` : whole} MON`;
}

function getDonationTime(timestamp: string) {
  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampSeconds * 1000));
}

export default function CreatorPage() {
  const [historyState, setHistoryState] = useState<HistoryState>({
    status: "idle",
  });
  const envioApiUrl = getEnvioApiUrl();
  const creatorAddress = getCreatorHistoryAddress();

  const loadHistory = useCallback(async () => {
    if (!creatorAddress) {
      setHistoryState({
        status: "unconfigured",
        reason: "Set NEXT_PUBLIC_CREATOR_WALLET_ADDRESS to view creator history.",
      });
      return;
    }

    setHistoryState({ status: "loading" });

    try {
      const history = await fetchCreatorHistory({
        apiUrl: envioApiUrl,
        creatorAddress,
      });

      setHistoryState(
        history.donations.length > 0
          ? { status: "ready", history }
          : { status: "empty", history },
      );
    } catch (error) {
      setHistoryState({
        status: "error",
        reason:
          error instanceof Error
            ? error.message
            : "Unable to load Envio donation history.",
      });
    }
  }, [creatorAddress, envioApiUrl]);

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
              Creator History
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              EmotePay Donations
            </h1>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={historyState.status === "loading"}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Total Received
            </div>
            <div className="mt-2 text-2xl font-black">
              {formatMonAmount(totalReceived)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Donations
            </div>
            <div className="mt-2 text-2xl font-black">{totalDonations}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Unique Donors
            </div>
            <div className="mt-2 text-2xl font-black">{uniqueDonors}</div>
          </div>
        </div>

        {historyState.status === "loading" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Loading indexed donation history...
          </div>
        )}

        {(historyState.status === "unconfigured" ||
          historyState.status === "error") && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
            {historyState.reason}
          </div>
        )}

        {historyState.status === "empty" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            No indexed donations found for this creator yet.
          </div>
        )}

        {rows.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-[1fr_1fr_1fr_1fr]">
              <span>Donation</span>
              <span>Donor</span>
              <span className="hidden sm:block">Block</span>
              <span>Tx</span>
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
                          {formatMonAmount(donation.amount)}
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {emote?.name ?? `Emote #${donation.emoteId}`} ·{" "}
                          {getDonationTime(donation.timestamp)}
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
