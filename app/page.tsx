"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Tv, Zap } from "lucide-react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { AuthButton } from "@/components/AuthButton";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { EMOTES, type Emote } from "@/lib/emotes";
import {
  getPaymentReadinessState,
  type PaymentState,
} from "@/lib/payment";
import { monadTestnet } from "@/lib/chains";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddressEqual,
  parseEther,
  type Address,
} from "viem";

const monadPublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});

type BalanceCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready" }
  | { status: "insufficient"; reason: string }
  | { status: "error"; reason: string };

function getEmbeddedWallet(
  wallets: ReturnType<typeof useWallets>["wallets"],
) {
  return wallets.find(
    (wallet) =>
      wallet.type === "ethereum" &&
      (wallet.walletClientType === "privy" ||
        wallet.walletClientType === "privy-v2"),
  );
}

function getTransactionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("user rejected")) {
    return "Transaction rejected by user.";
  }

  if (
    lowerMessage.includes("insufficient") ||
    lowerMessage.includes("exceeds balance")
  ) {
    return "Insufficient MON balance.";
  }

  if (lowerMessage.includes("revert")) {
    return "Donation transaction reverted.";
  }

  if (lowerMessage.includes("fetch") || lowerMessage.includes("network")) {
    return "RPC request failed. Please try again.";
  }

  return "Donation transaction failed.";
}

async function getRequiredDonationBalance({
  contractAddress,
  creatorAddress,
  donorAddress,
  onchainId,
  value,
}: {
  contractAddress: Address;
  creatorAddress: Address;
  donorAddress: Address;
  onchainId: number;
  value: bigint;
}) {
  const gas = await monadPublicClient.estimateContractGas({
    address: contractAddress,
    abi: emotePayContract.abi,
    functionName: "donate",
    args: [creatorAddress, BigInt(onchainId)],
    account: donorAddress,
    value,
  });
  const gasPrice = await monadPublicClient.getGasPrice();

  return value + gas * gasPrice;
}

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [selectedEmote, setSelectedEmote] = useState<Emote>(EMOTES[0]);
  const [message, setMessage] = useState("");
  const [alerts, setAlerts] = useState<Array<{ id: number; emote: Emote; message: string }>>([]);
  const [transactionState, setTransactionState] = useState<PaymentState>({
    status: "idle",
  });
  const [balanceCheck, setBalanceCheck] = useState<BalanceCheckState>({
    status: "idle",
  });
  const embeddedWallet = useMemo(() => getEmbeddedWallet(wallets), [wallets]);
  const embeddedWalletAddress = embeddedWallet?.address as Address | undefined;
  const isSelfDonation =
    Boolean(embeddedWalletAddress && demoCreator.walletAddress) &&
    isAddressEqual(
      embeddedWalletAddress!,
      demoCreator.walletAddress as Address,
    );
  const readinessState = getPaymentReadinessState({
    authReady: ready,
    authenticated,
    walletsReady,
    hasEmbeddedWallet: Boolean(embeddedWallet),
    creatorStatus: demoCreator.configurationStatus,
    contractStatus: emotePayContract.configurationStatus,
    isSelfDonation,
  });
  const paymentState =
    transactionState.status === "pending" ||
    transactionState.status === "success"
      ? transactionState
      : readinessState.status === "ready"
        ? readinessState
        : transactionState.status === "error"
        ? transactionState
        : readinessState;
  const effectiveBalanceCheck: BalanceCheckState =
    readinessState.status === "ready" ? balanceCheck : { status: "idle" };
  const balanceCheckMessage =
    effectiveBalanceCheck.status === "insufficient" ||
    effectiveBalanceCheck.status === "error"
      ? effectiveBalanceCheck.reason
      : null;
  const canSendReaction =
    readinessState.status === "ready" &&
    paymentState.status !== "pending" &&
    effectiveBalanceCheck.status === "ready";
  const sendButtonLabel =
    paymentState.status === "pending"
      ? "Confirming reaction..."
      : effectiveBalanceCheck.status === "checking"
        ? "Checking wallet balance..."
        : effectiveBalanceCheck.status === "insufficient"
          ? "Wallet needs testnet MON"
          : canSendReaction
            ? `Send ${selectedEmote.name} (${selectedEmote.displayAmount})`
            : authenticated
              ? "Payments not ready"
              : "Log in to send reaction";

  useEffect(() => {
    if (
      readinessState.status !== "ready" ||
      !embeddedWalletAddress ||
      !demoCreator.walletAddress ||
      !emotePayContract.address
    ) {
      return;
    }

    const donorAddress = embeddedWalletAddress;
    const creatorAddress = demoCreator.walletAddress;
    const contractAddress = emotePayContract.address;
    let isCancelled = false;

    async function checkWalletBalance() {
      setBalanceCheck({ status: "checking" });

      try {
        const value = parseEther(selectedEmote.amountMon);
        const requiredBalance = await getRequiredDonationBalance({
          contractAddress,
          creatorAddress,
          donorAddress,
          onchainId: selectedEmote.onchainId,
          value,
        });
        const balance = await monadPublicClient.getBalance({
          address: donorAddress,
        });

        if (isCancelled) {
          return;
        }

        setBalanceCheck(
          balance >= requiredBalance
            ? { status: "ready" }
            : {
                status: "insufficient",
                reason: "Your wallet needs Monad Testnet MON.",
              },
        );
      } catch {
        if (!isCancelled) {
          setBalanceCheck({
            status: "error",
            reason: "Unable to check wallet balance right now.",
          });
        }
      }
    }

    checkWalletBalance();

    return () => {
      isCancelled = true;
    };
  }, [
    embeddedWalletAddress,
    readinessState.status,
    selectedEmote.amountMon,
    selectedEmote.onchainId,
  ]);

  const triggerDonationAlert = (emote: Emote, alertMessage: string) => {
    const newAlert = {
      id: Date.now(),
      emote,
      message: alertMessage || "¡Grandioso stream! 🔥",
    };

    setAlerts((prev) => [newAlert, ...prev]);
    setMessage("");

    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
    }, 4000);
  };

  const handleSendReaction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSendReaction) {
      setTransactionState(
        balanceCheckMessage
          ? { status: "error", reason: balanceCheckMessage }
          : readinessState,
      );
      return;
    }

    if (!embeddedWallet || !demoCreator.walletAddress || !emotePayContract.address) {
      setTransactionState({
        status: "error",
        reason: "Payment configuration is not ready.",
      });
      return;
    }

    const donationMessage = message;
    const value = parseEther(selectedEmote.amountMon);

    try {
      setTransactionState({ status: "pending" });

      await embeddedWallet.switchChain(monadTestnet.id);

      const requiredBalance = await getRequiredDonationBalance({
        contractAddress: emotePayContract.address,
        creatorAddress: demoCreator.walletAddress,
        donorAddress: embeddedWallet.address as Address,
        onchainId: selectedEmote.onchainId,
        value,
      });
      const balance = await monadPublicClient.getBalance({
        address: embeddedWallet.address as Address,
      });

      if (balance < requiredBalance) {
        setBalanceCheck({
          status: "insufficient",
          reason: "Your wallet needs Monad Testnet MON.",
        });
        setTransactionState({
          status: "error",
          reason: "Your wallet needs Monad Testnet MON.",
        });
        return;
      }

      const data = encodeFunctionData({
        abi: emotePayContract.abi,
        functionName: "donate",
        args: [demoCreator.walletAddress, BigInt(selectedEmote.onchainId)],
      });
      const { hash } = await sendTransaction(
        {
          to: emotePayContract.address,
          data,
          value,
          chainId: monadTestnet.id,
        },
        {
          address: embeddedWallet.address,
        },
      );

      setTransactionState({ status: "pending", hash });

      const receipt = await monadPublicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        setTransactionState({
          status: "error",
          reason: "Donation transaction reverted.",
        });
        return;
      }

      setTransactionState({ status: "success", reference: hash });
      triggerDonationAlert(selectedEmote, donationMessage);
    } catch (error) {
      setTransactionState({
        status: "error",
        reason: getTransactionErrorMessage(error),
      });
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500 selection:text-white relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header / Navbar */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/50 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-xl shadow-lg shadow-purple-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              Emote<span className="text-purple-400">Pay</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Monad Testnet
            </button>
            <AuthButton />
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Stream Simulator & Overlay (Left Column - 7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Tv className="w-4 h-4 text-purple-400" /> Stream Overlay Preview
            </h2>
            <span className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/20">
              OBS Live Feed
            </span>
          </div>

          {/* Stream Video Screen Mockup */}
          <div className="relative aspect-video rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center">
            {/* Stream Background Mockup */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-purple-950/40 flex flex-col items-center justify-center text-slate-600">
              <Tv className="w-16 h-16 stroke-[1] mb-2 opacity-40" />
              <p className="text-sm">Live Stream Gameplay Preview</p>
            </div>

            {/* OVERLAY ALERT ANIMATION (Lo que se ve en la pantalla del streamer) */}
            <AnimatePresence>
              {alerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, scale: 0.5, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -40 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute z-20 flex flex-col items-center text-center p-6 rounded-2xl bg-slate-900/90 border border-purple-500/40 backdrop-blur-xl shadow-2xl shadow-purple-500/30 max-w-xs"
                >
                  <motion.span
                    animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-6xl mb-2"
                  >
                    {alert.emote.emoji}
                  </motion.span>
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-1">
                    {alert.emote.name} ({alert.emote.displayAmount})
                  </div>
                  <p className="text-sm font-medium text-slate-200">
                    &quot;{alert.message}&quot;
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Viewer Reaction Panel (Right Column - 5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" /> Send Reaction Gesture
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Support the streamer instantly with zero crypto friction.
            </p>

            <form onSubmit={handleSendReaction} className="flex flex-col gap-5">
              {/* Emote Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                  1. Select your Gesture Emote
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {EMOTES.map((e) => {
                    const isSelected = selectedEmote.id === e.id;
                    return (
                      <button
                        type="button"
                        key={e.id}
                        onClick={() => setSelectedEmote(e)}
                        className={`p-3 rounded-xl border transition-all flex items-center gap-3 text-left ${
                          isSelected
                            ? "bg-purple-600/15 border-purple-500 shadow-lg shadow-purple-500/10"
                            : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-2xl">{e.emoji}</span>
                        <div>
                          <div className="text-xs font-bold text-slate-200">{e.name}</div>
                          <div className="text-[11px] font-medium text-purple-400">{e.displayAmount}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  2. Add a Message (Optional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="¡Tremenda jugada bro!"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={!canSendReaction}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r ${selectedEmote.color} hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed`}
              >
                <Send className="w-4 h-4" />{" "}
                {sendButtonLabel}
              </button>
              {!authenticated && (
                <p className="text-xs text-slate-500 text-center">
                  Sign in with Google or email to create your embedded wallet.
                </p>
              )}
              {authenticated && paymentState.status === "pending" && (
                <p className="text-xs text-purple-300 text-center">
                  Waiting for Monad confirmation
                  {paymentState.hash ? `: ${paymentState.hash.slice(0, 10)}...` : "."}
                </p>
              )}
              {authenticated && paymentState.status === "success" && (
                <p className="text-xs text-emerald-300 text-center">
                  Donation confirmed
                  {paymentState.reference ? `: ${paymentState.reference.slice(0, 10)}...` : "."}
                </p>
              )}
              {authenticated && paymentState.status === "error" && (
                <p className="text-xs text-amber-300 text-center">
                  {paymentState.reason}
                </p>
              )}
              {authenticated &&
                paymentState.status !== "error" &&
                balanceCheckMessage && (
                  <p className="text-xs text-amber-300 text-center">
                    {balanceCheckMessage}
                  </p>
                )}
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}
