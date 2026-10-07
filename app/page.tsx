"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radio,
  Send,
  Sparkles,
  Tv,
} from "lucide-react";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { AuthButton } from "@/components/AuthButton";
import { monadTestnet } from "@/lib/chains";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { EMOTES, type Emote } from "@/lib/emotes";
import { getPaymentReadinessState } from "@/lib/payment";
import {
  createReceiveAuthorizationValidity,
  receiveWithAuthorizationTypes,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
} from "@/lib/usdc-authorization";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import Image from "next/image";

const monadPublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});
const kickChannel = process.env.NEXT_PUBLIC_KICK_CHANNEL?.trim().replace(/^@/, "");
const kickPlayerUrl = kickChannel
  ? `https://player.kick.com/${encodeURIComponent(kickChannel)}?autoplay=true&muted=true`
  : null;

type BalanceCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ready";
      usdcAddress: Address;
      contractPrice: bigint;
    }
  | { status: "insufficient"; reason: string }
  | { status: "error"; reason: string };

type TransactionState =
  | { status: "idle" }
  | { status: "awaiting-approval" }
  | { status: "submitting" }
  | { status: "confirming"; hash: `0x${string}` }
  | { status: "success"; reference: `0x${string}` }
  | { status: "failure"; reason: string };

type RelayDonationResponse =
  | {
      hash: `0x${string}`;
      amount: string;
      nonce: Hex;
    }
  | {
      error: string;
    };

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

function shortenAddress(address?: string | null) {
  if (!address) {
    return "Unavailable";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTransactionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("user rejected") ||
    lowerMessage.includes("user denied") ||
    lowerMessage.includes("rejected")
  ) {
    return "You cancelled the wallet signature. No reaction was sent.";
  }

  if (
    lowerMessage.includes("insufficient") ||
    lowerMessage.includes("exceeds balance")
  ) {
    return "Your embedded wallet needs more USDC for the reaction or more Monad Testnet MON for gas.";
  }

  if (lowerMessage.includes("revert")) {
    return "Monad did not complete this payment, so the reaction was not sent.";
  }

  if (
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("rpc")
  ) {
    return "We could not reach Monad Testnet. Please check your connection and try again.";
  }

  return "We could not send that reaction. Please try again when you are ready.";
}

function getReadinessMessage(reason: string) {
  if (reason.includes("Creator wallet")) {
    return "This creator is not ready to receive reactions yet.";
  }

  if (reason.includes("contract")) {
    return "EmotePay payments are not configured for this page yet.";
  }

  if (reason.includes("Embedded wallet")) {
    return "Your embedded wallet is still being prepared. Please wait a moment.";
  }

  return reason;
}

function formatUsdcAmount(amount: bigint) {
  const fullAmount = formatUnits(amount, 6);
  const [whole, fraction = ""] = fullAmount.split(".");
  const visibleFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return `${visibleFraction ? `${whole}.${visibleFraction}` : whole} USDC`;
}

function createRandomSalt(): Hex {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);

  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}` as Hex;
}

async function getPaymentRequirements({
  contractAddress,
  donorAddress,
  onchainId,
}: {
  contractAddress: Address;
  donorAddress: Address;
  onchainId: number;
}) {
  const [usdcAddress, contractPrice] = await Promise.all([
    monadPublicClient.readContract({
      address: contractAddress,
      abi: emotePayContract.abi,
      functionName: "usdc",
    }),
    monadPublicClient.readContract({
      address: contractAddress,
      abi: emotePayContract.abi,
      functionName: "getEmotePrice",
      args: [BigInt(onchainId)],
    }),
  ]);
  const usdcBalance = await monadPublicClient.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [donorAddress],
  });

  return {
    usdcAddress,
    contractPrice,
    usdcBalance,
  };
}

function getExplorerTransactionUrl(hash: `0x${string}`) {
  return `https://testnet.monadexplorer.com/tx/${hash}`;
}

function KickStreamPlayer({ compact = false }: { compact?: boolean }) {
  const roundedClass = compact ? "rounded-xl" : "rounded-2xl";

  return (
    <div
      className={`relative aspect-video ${roundedClass} bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl`}
    >
      {kickPlayerUrl ? (
        <iframe
          src={kickPlayerUrl}
          title="Kick livestream"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-500">
          <Tv
            className={`${compact ? "w-9 h-9" : "w-14 h-14 sm:w-16 sm:h-16"} stroke-[1] mb-2 opacity-50`}
          />
          <p className={compact ? "text-xs" : "text-sm"}>
            Kick stream not configured
          </p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const [selectedEmote, setSelectedEmote] = useState<Emote>(EMOTES[0]);
  const [message, setMessage] = useState("");
  const [transactionState, setTransactionState] = useState<TransactionState>({
    status: "idle",
  });
  const [balanceCheck, setBalanceCheck] = useState<BalanceCheckState>({
    status: "idle",
  });
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  const embeddedWallet = useMemo(() => getEmbeddedWallet(wallets), [wallets]);
  const embeddedWalletAddress = embeddedWallet?.address as Address | undefined;
  const isSelfDonation =
    Boolean(embeddedWalletAddress && demoCreator.walletAddress) &&
    isAddressEqual(embeddedWalletAddress!, demoCreator.walletAddress as Address);
  const readinessState = getPaymentReadinessState({
    authReady: ready,
    authenticated,
    walletsReady,
    hasEmbeddedWallet: Boolean(embeddedWallet),
    creatorStatus: demoCreator.configurationStatus,
    contractStatus: emotePayContract.configurationStatus,
    isSelfDonation,
  });
  const effectiveBalanceCheck: BalanceCheckState =
    readinessState.status === "ready" ? balanceCheck : { status: "idle" };
  const balanceCheckMessage =
    effectiveBalanceCheck.status === "insufficient" ||
    effectiveBalanceCheck.status === "error"
      ? effectiveBalanceCheck.reason
      : null;
  const isActivePayment =
    transactionState.status === "awaiting-approval" ||
    transactionState.status === "submitting" ||
    transactionState.status === "confirming";
  const canSendReaction =
    readinessState.status === "ready" &&
    !isActivePayment &&
    effectiveBalanceCheck.status === "ready";
  const selectedAmountLabel =
    effectiveBalanceCheck.status === "ready"
      ? formatUsdcAmount(effectiveBalanceCheck.contractPrice)
      : selectedEmote.displayAmount;
  const lastHash =
    transactionState.status === "confirming"
      ? transactionState.hash
      : transactionState.status === "success"
        ? transactionState.reference
        : undefined;
  const paymentNotice = (() => {
    if (!ready) {
      return {
        tone: "neutral",
        title: "Getting EmotePay ready",
        body: "Loading sign-in so you can send a reaction.",
      };
    }

    if (!authenticated) {
      return {
        tone: "neutral",
        title: "Ready when you sign in",
        body: "Use Google or email to send this reaction with an embedded wallet.",
      };
    }

    if (transactionState.status === "awaiting-approval") {
      return {
        tone: "active",
        title: "Awaiting signature",
        body: "Sign the exact USDC reaction authorization to continue.",
      };
    }

    if (transactionState.status === "submitting") {
      return {
        tone: "active",
        title: "Submitting reaction",
        body: "Sending your USDC reaction payment to Monad Testnet.",
      };
    }

    if (transactionState.status === "confirming") {
      return {
        tone: "active",
        title: "Confirming on Monad",
        body: "Your reaction is waiting for payment confirmation.",
      };
    }

    if (transactionState.status === "success") {
      if (showSuccessBanner) {
        return {
          tone: "success",
          title: "Reaction sent",
          body: "Your support was confirmed and the stream reaction is now live.",
        };
      }

      return null;
    }

    if (transactionState.status === "failure") {
      return {
        tone: "error",
        title: "Reaction not sent",
        body: transactionState.reason,
      };
    }

    if (readinessState.status === "error") {
      return {
        tone: "error",
        title: "Sending is unavailable",
        body: getReadinessMessage(readinessState.reason),
      };
    }

    if (effectiveBalanceCheck.status === "checking") {
      return {
        tone: "active",
        title: "Checking wallet",
        body: "Making sure your embedded wallet can cover the reaction.",
      };
    }

    if (balanceCheckMessage) {
      return {
        tone: "error",
        title: "Wallet needs funds",
        body: balanceCheckMessage,
      };
    }

    return {
      tone: "success",
      title: "Ready to authorize",
      body: `You are sending ${selectedEmote.name} for exactly ${selectedAmountLabel}.`,
    };
  })();
  const sendButtonLabel = (() => {
    if (transactionState.status === "awaiting-approval") {
      return "Sign authorization";
    }

    if (transactionState.status === "submitting") {
      return "Submitting reaction";
    }

    if (transactionState.status === "confirming") {
      return "Confirming payment";
    }

    if (effectiveBalanceCheck.status === "checking") {
      return "Checking wallet";
    }

    if (effectiveBalanceCheck.status === "insufficient") {
      return "Wallet needs funds";
    }

    if (!authenticated) {
      return "Log in to send reaction";
    }

    if (!canSendReaction) {
      return "Sending unavailable";
    }

    return `Send ${selectedEmote.name}`;
  })();

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
    const contractAddress = emotePayContract.address;
    let isCancelled = false;

    async function checkWalletBalance() {
      setBalanceCheck({ status: "checking" });

      try {
        const requirements = await getPaymentRequirements({
          contractAddress,
          donorAddress,
          onchainId: selectedEmote.onchainId,
        });

        if (isCancelled) {
          return;
        }

        if (requirements.usdcBalance < requirements.contractPrice) {
          setBalanceCheck({
            status: "insufficient",
            reason: `Your embedded wallet needs at least ${formatUsdcAmount(
              requirements.contractPrice,
            )} to send this reaction.`,
          });
          return;
        }

        setBalanceCheck({
          status: "ready",
          usdcAddress: requirements.usdcAddress,
          contractPrice: requirements.contractPrice,
        });
      } catch {
        if (!isCancelled) {
          setBalanceCheck({
            status: "error",
            reason:
              "We could not check your USDC balance or reaction price. Please try again shortly.",
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
    selectedEmote.onchainId,
  ]);

  useEffect(() => {
    if (!showSuccessBanner) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSuccessBanner(false);
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showSuccessBanner]);

  const handleSendReaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccessBanner(false);

    if (!canSendReaction) {
      setTransactionState({
        status: "failure",
        reason:
          balanceCheckMessage ??
          (readinessState.status === "error"
            ? getReadinessMessage(readinessState.reason)
            : "This reaction is not ready to send yet."),
      });
      return;
    }

    if (!embeddedWallet || !demoCreator.walletAddress || !emotePayContract.address) {
      setTransactionState({
        status: "failure",
        reason: "This payment page is not configured yet.",
      });
      return;
    }

    try {
      setTransactionState({ status: "awaiting-approval" });

      await embeddedWallet.switchChain(monadTestnet.id);

      const donorAddress = embeddedWallet.address as Address;
      const requirements = await getPaymentRequirements({
        contractAddress: emotePayContract.address,
        donorAddress,
        onchainId: selectedEmote.onchainId,
      });

      if (requirements.usdcBalance < requirements.contractPrice) {
        const reason = `Your embedded wallet needs at least ${formatUsdcAmount(
          requirements.contractPrice,
        )} to send this reaction.`;
        setBalanceCheck({
          status: "insufficient",
          reason,
        });
        setTransactionState({
          status: "failure",
          reason,
        });
        return;
      }

      const randomSalt = createRandomSalt();
      const { validAfter, validBefore } = createReceiveAuthorizationValidity(
        Math.floor(Date.now() / 1000),
      );
      const nonce = await monadPublicClient.readContract({
        address: emotePayContract.address,
        abi: emotePayContract.abi,
        functionName: "computeDonationAuthorizationNonce",
        args: [
          donorAddress,
          demoCreator.walletAddress,
          BigInt(selectedEmote.onchainId),
          requirements.contractPrice,
          randomSalt,
        ],
      });
      const { signature } = await signTypedData(
        {
          domain: {
            name: USDC_EIP712_NAME,
            version: USDC_EIP712_VERSION,
            chainId: monadTestnet.id,
            verifyingContract: requirements.usdcAddress,
          },
          primaryType: "ReceiveWithAuthorization",
          types: receiveWithAuthorizationTypes,
          message: {
            from: donorAddress,
            to: emotePayContract.address,
            value: requirements.contractPrice,
            validAfter,
            validBefore,
            nonce,
          },
        },
        {
          address: embeddedWallet.address,
        },
      );

      setTransactionState({ status: "submitting" });

      const relayResponse = await fetch("/api/relay-donation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contractAddress: emotePayContract.address,
          usdcAddress: requirements.usdcAddress,
          donor: donorAddress,
          creator: demoCreator.walletAddress,
          emoteId: selectedEmote.onchainId.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          randomSalt,
          signature,
        }),
      });
      const relayResult = (await relayResponse.json()) as RelayDonationResponse;

      if (!relayResponse.ok || "error" in relayResult) {
        setTransactionState({
          status: "failure",
          reason:
            "error" in relayResult
              ? relayResult.error
              : "The relayer could not submit this reaction.",
        });
        return;
      }

      setTransactionState({ status: "confirming", hash: relayResult.hash });

      const receipt = await monadPublicClient.waitForTransactionReceipt({
        hash: relayResult.hash,
      });

      if (receipt.status !== "success") {
        setTransactionState({
          status: "failure",
          reason: "Monad did not complete this payment, so the reaction was not sent.",
        });
        return;
      }

      setTransactionState({ status: "success", reference: relayResult.hash });
      setShowSuccessBanner(true);
      setMessage("");
    } catch (error) {
      setTransactionState({
        status: "failure",
        reason: getTransactionErrorMessage(error),
      });
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500 selection:text-white">
      <header className="border-b border-slate-800/80 bg-slate-950/95 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-15 h-15 shrink-0">
              <Image
                    src="/emotepay-logo.png"
                    alt="EmotePay logo"
                    fill 
                    priority
                    className="object-contain"
              />
          </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              Emote<span className="text-purple-400">Pay</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex text-xs font-medium px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Testnet
            </div>
            <AuthButton />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        <section className="lg:col-span-5 lg:order-2 flex flex-col gap-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
            <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-400 to-purple-500 flex items-center justify-center text-lg font-black text-slate-950 shrink-0">
                  {demoCreator.displayName.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5" />
                    Live creator
                  </p>
                  <p className="truncate text-base font-black text-white">
                    {demoCreator.displayName}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-emerald-50/80">
                Your reaction supports this creator after the payment is
                confirmed.
              </p>
            </div>

            <div className="lg:hidden mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Tv className="w-3.5 h-3.5 text-purple-400" />
                  Stream preview
                </p>
                <span className="text-[11px] text-purple-300">
                  Live on Kick
                </span>
              </div>
              <KickStreamPlayer compact />
            </div>

            <div className="mb-5">
              <h1 className="text-2xl font-black text-white leading-tight">
                Send a reaction
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Choose a reaction that carries value. You will see the exact USDC
                amount before signing.
              </p>
            </div>

            <form onSubmit={handleSendReaction} className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Pick a reaction
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Fixed demo amounts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {EMOTES.map((emote) => {
                    const isSelected = selectedEmote.id === emote.id;

                    return (
                      <button
                        type="button"
                        key={emote.id}
                        onClick={() => setSelectedEmote(emote)}
                        disabled={isActivePayment}
                        aria-pressed={isSelected}
                        className={`min-h-28 p-3 rounded-xl border transition-all flex flex-col items-start justify-between text-left disabled:cursor-not-allowed disabled:opacity-70 ${
                          isSelected
                            ? "bg-purple-600/15 border-purple-400 shadow-lg shadow-purple-500/10"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-3xl leading-none">
                          {emote.emoji}
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-slate-100">
                            {emote.name}
                          </span>
                          <span className="block text-xs font-semibold text-purple-300">
                            {emote.displayAmount}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  Message optional
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isActivePayment}
                  placeholder="Great play!"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-60"
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">You are sending</p>
                    <p className="text-base font-bold text-white">
                      {selectedEmote.emoji} {selectedEmote.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Exact amount</p>
                    <p className="text-base font-black text-emerald-300">
                      {selectedAmountLabel}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSendReaction}
                className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r ${selectedEmote.color} hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed`}
              >
                {isActivePayment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendButtonLabel}
              </button>

              {paymentNotice && (
                <div
                  role={paymentNotice.tone === "error" ? "alert" : "status"}
                  aria-live={
                    paymentNotice.tone === "error" ? "assertive" : "polite"
                  }
                  className={`rounded-xl border p-4 ${
                    paymentNotice.tone === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : paymentNotice.tone === "error"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : paymentNotice.tone === "active"
                          ? "bg-purple-500/10 border-purple-500/30"
                          : "bg-slate-950/70 border-slate-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {paymentNotice.tone === "success" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-300 mt-0.5 shrink-0" />
                    ) : paymentNotice.tone === "error" ? (
                      <AlertCircle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
                    ) : paymentNotice.tone === "active" ? (
                      <Loader2 className="w-5 h-5 text-purple-300 mt-0.5 shrink-0 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">
                        {paymentNotice.title}
                      </p>
                      <p className="text-sm text-slate-300 mt-1">
                        {paymentNotice.body}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <details className="group rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-300 flex items-center justify-between gap-3">
                  Transaction details
                  <span className="text-xs text-slate-500 group-open:hidden">
                    Show
                  </span>
                  <span className="hidden text-xs text-slate-500 group-open:inline">
                    Hide
                  </span>
                </summary>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Network</dt>
                    <dd className="text-slate-300">
                      {monadTestnet.name} ({monadTestnet.id})
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Your wallet</dt>
                    <dd className="font-mono text-slate-300">
                      {shortenAddress(embeddedWalletAddress)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Creator wallet</dt>
                    <dd className="font-mono text-slate-300">
                      {shortenAddress(demoCreator.walletAddress)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Contract</dt>
                    <dd className="font-mono text-slate-300">
                      {shortenAddress(emotePayContract.address)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">USDC token</dt>
                    <dd className="font-mono text-slate-300">
                      {effectiveBalanceCheck.status === "ready"
                        ? shortenAddress(effectiveBalanceCheck.usdcAddress)
                        : "Pending check"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Transaction</dt>
                    <dd className="font-mono text-slate-300">
                      {lastHash ? shortenAddress(lastHash) : "Pending send"}
                    </dd>
                  </div>
                  {lastHash && (
                    <a
                      href={getExplorerTransactionUrl(lastHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
                    >
                      View on Monad explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </dl>
              </details>
            </form>
          </div>
        </section>

        <section className="hidden lg:col-span-7 lg:order-1 lg:flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Tv className="w-4 h-4 text-purple-400" />
              Stream preview
            </h2>
            <span className="text-xs bg-purple-500/10 text-purple-300 px-2.5 py-1 rounded-full border border-purple-500/20">
              Live on Kick
            </span>
          </div>

          <KickStreamPlayer />
        </section>
      </div>
    </main>
  );
}
