"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Radio,
  Send,
  Tv,
} from "lucide-react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { AuthButton } from "@/components/AuthButton";
import { monadTestnet } from "@/lib/chains";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { EMOTES, type Emote } from "@/lib/emotes";
import { getPaymentReadinessState } from "@/lib/payment";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
  type Address,
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
// El ancho del video se topa contra el alto de la ventana para que las
// tarjetas de reacción entren sin scroll. 24rem es el alto fijo de todo lo
// demás (header, paddings, tarjetas y botón) y los 3rem compensan el padding
// horizontal, que el max-width incluye por el box-sizing de Tailwind.
const STREAM_COLUMN_MAX_WIDTH =
  "min(896px, calc((100vh - 24rem) * 16 / 9 + 3rem))";

type BalanceCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ready";
      usdcAddress: Address;
      contractPrice: bigint;
      requiresApproval: boolean;
    }
  | { status: "insufficient"; reason: string }
  | { status: "error"; reason: string };

type TransactionState =
  | { status: "idle" }
  | { status: "awaiting-approval" }
  | { status: "approving"; hash: `0x${string}` }
  | { status: "submitting" }
  | { status: "confirming"; hash: `0x${string}` }
  | { status: "success"; reference: `0x${string}` }
  | { status: "failure"; reason: string };

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
    return "You cancelled the wallet approval. No reaction was sent.";
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

async function getPaymentRequirements({
  contractAddress,
  donorAddress,
  onchainId,
}: {
  contractAddress: Address;
  donorAddress: Address;
  onchainId: number;
}) {
  const [usdcAddress, contractPrice, gasPrice] = await Promise.all([
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
    monadPublicClient.getGasPrice(),
  ]);
  const [usdcBalance, allowance, nativeBalance] = await Promise.all([
    monadPublicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [donorAddress],
    }),
    monadPublicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [donorAddress, contractAddress],
    }),
    monadPublicClient.getBalance({
      address: donorAddress,
    }),
  ]);
  const requiresApproval = allowance < contractPrice;
  const approvalGas = requiresApproval
    ? await monadPublicClient.estimateContractGas({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [contractAddress, contractPrice],
        account: donorAddress,
      })
    : 0n;

  return {
    usdcAddress,
    contractPrice,
    usdcBalance,
    nativeBalance,
    allowance,
    requiresApproval,
    requiredApprovalGasBalance: approvalGas * gasPrice,
  };
}

async function getRequiredDonationGasBalance({
  contractAddress,
  creatorAddress,
  donorAddress,
  onchainId,
}: {
  contractAddress: Address;
  creatorAddress: Address;
  donorAddress: Address;
  onchainId: number;
}) {
  const [gas, gasPrice] = await Promise.all([
    monadPublicClient.estimateContractGas({
      address: contractAddress,
      abi: emotePayContract.abi,
      functionName: "donate",
      args: [creatorAddress, BigInt(onchainId)],
      account: donorAddress,
    }),
    monadPublicClient.getGasPrice(),
  ]);

  return gas * gasPrice;
}

function getExplorerTransactionUrl(hash: `0x${string}`) {
  return `https://testnet.monadexplorer.com/tx/${hash}`;
}

// El recorte redondeado vive en un envoltorio interno para que los overlays
// que recibe como children puedan desbordar el video, como el popover de
// detalles en pantallas donde el reproductor es chico.
function KickStreamPlayer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative aspect-video w-full">
      <div className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
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
            <Tv className="w-14 h-14 sm:w-16 sm:h-16 stroke-[1] mb-2 opacity-50" />
            <p className="text-sm">Kick stream not configured</p>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [selectedEmote, setSelectedEmote] = useState<Emote>(EMOTES[0]);
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
    transactionState.status === "approving" ||
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
    transactionState.status === "approving"
      ? transactionState.hash
      : transactionState.status === "confirming"
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
        title: "Awaiting approval",
        body: "Approve the wallet prompt to continue.",
      };
    }

    if (transactionState.status === "approving") {
      return {
        tone: "active",
        title: "Confirming USDC approval",
        body: "Your exact USDC approval is waiting for confirmation.",
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

    const requiresUsdcApproval =
      effectiveBalanceCheck.status === "ready" &&
      effectiveBalanceCheck.requiresApproval;

    return {
      tone: "success",
      title: requiresUsdcApproval ? "Ready for USDC approval" : "Ready to send",
      body: requiresUsdcApproval
        ? `Approve exactly ${selectedAmountLabel}, then send ${selectedEmote.name}.`
        : `You are sending ${selectedEmote.name} for exactly ${selectedAmountLabel}.`,
    };
  })();
  const sendButtonLabel = (() => {
    if (transactionState.status === "awaiting-approval") {
      return "Approve in wallet";
    }

    if (transactionState.status === "submitting") {
      return "Submitting reaction";
    }

    if (transactionState.status === "approving") {
      return "Confirming approval";
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
  // Sobre el video solo van los estados que piden atención: el aviso de
  // "Ready to send" quedaría fijo encima del stream sin aportar nada.
  const overlayNotice =
    paymentNotice &&
    (paymentNotice.tone === "error" ||
      paymentNotice.tone === "active" ||
      (paymentNotice.tone === "success" && showSuccessBanner))
      ? paymentNotice
      : null;

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

        if (
          requirements.nativeBalance <
          requirements.requiredApprovalGasBalance
        ) {
          setBalanceCheck({
            status: "insufficient",
            reason:
              "Your embedded wallet needs more Monad Testnet MON for USDC approval gas.",
          });
          return;
        }

        setBalanceCheck({
          status: "ready",
          usdcAddress: requirements.usdcAddress,
          contractPrice: requirements.contractPrice,
          requiresApproval: requirements.requiresApproval,
        });
      } catch {
        if (!isCancelled) {
          setBalanceCheck({
            status: "error",
            reason:
              "We could not check your USDC balance or approval. Please try again shortly.",
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

      if (
        requirements.nativeBalance <
        requirements.requiredApprovalGasBalance
      ) {
        const reason =
          "Your embedded wallet needs more Monad Testnet MON for USDC approval gas.";
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

      if (requirements.allowance < requirements.contractPrice) {
        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [emotePayContract.address, requirements.contractPrice],
        });
        const { hash: approvalHash } = await sendTransaction(
          {
            to: requirements.usdcAddress,
            data: approvalData,
            chainId: monadTestnet.id,
          },
          {
            address: embeddedWallet.address,
          },
        );

        setTransactionState({ status: "approving", hash: approvalHash });

        const approvalReceipt =
          await monadPublicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

        if (approvalReceipt.status !== "success") {
          setTransactionState({
            status: "failure",
            reason:
              "Monad did not confirm the USDC approval, so the reaction was not sent.",
          });
          return;
        }

        setTransactionState({ status: "awaiting-approval" });
      }

      const requiredDonationGasBalance = await getRequiredDonationGasBalance({
        contractAddress: emotePayContract.address,
        creatorAddress: demoCreator.walletAddress,
        donorAddress,
        onchainId: selectedEmote.onchainId,
      });
      const nativeBalance = await monadPublicClient.getBalance({
        address: donorAddress,
      });

      if (nativeBalance < requiredDonationGasBalance) {
        const reason =
          "Your embedded wallet needs more Monad Testnet MON for donation gas.";
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

      const data = encodeFunctionData({
        abi: emotePayContract.abi,
        functionName: "donate",
        args: [demoCreator.walletAddress, BigInt(selectedEmote.onchainId)],
      });

      setTransactionState({ status: "submitting" });

      const { hash } = await sendTransaction(
        {
          to: emotePayContract.address,
          data,
          chainId: monadTestnet.id,
        },
        {
          address: embeddedWallet.address,
        },
      );

      setTransactionState({ status: "confirming", hash });

      const receipt = await monadPublicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        setTransactionState({
          status: "failure",
          reason: "Monad did not complete this payment, so the reaction was not sent.",
        });
        return;
      }

      setTransactionState({ status: "success", reference: hash });
      setShowSuccessBanner(true);
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

      <div
        className="mx-auto w-full px-4 sm:px-6 py-5"
        style={{ maxWidth: STREAM_COLUMN_MAX_WIDTH }}
      >
        <KickStreamPlayer>
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-purple-500 text-xs font-black text-slate-950">
              {demoCreator.displayName.slice(0, 1)}
            </div>
            <span className="text-[13px] font-bold text-white">
              {demoCreator.displayName}
            </span>
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-full border border-emerald-700 bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5" />
              Live on Kick
            </span>
            <details className="relative">
              <summary
                aria-label="Transaction details"
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-slate-300 backdrop-blur-sm transition-colors hover:text-white"
              >
                <Info className="h-4 w-4" />
              </summary>
              <dl className="absolute right-0 top-full z-40 mt-2 grid w-[min(20rem,calc(100vw-2rem))] grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-xs shadow-2xl backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Network</dt>
                  <dd className="text-slate-300">
                    {monadTestnet.name} ({monadTestnet.id})
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Your wallet</dt>
                  <dd className="font-mono text-slate-300">
                    {shortenAddress(embeddedWalletAddress)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Creator wallet</dt>
                  <dd className="font-mono text-slate-300">
                    {shortenAddress(demoCreator.walletAddress)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Contract</dt>
                  <dd className="font-mono text-slate-300">
                    {shortenAddress(emotePayContract.address)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">USDC token</dt>
                  <dd className="font-mono text-slate-300">
                    {effectiveBalanceCheck.status === "ready"
                      ? shortenAddress(effectiveBalanceCheck.usdcAddress)
                      : "Pending check"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Transaction</dt>
                  <dd className="font-mono text-slate-300">
                    {lastHash ? shortenAddress(lastHash) : "Pending send"}
                  </dd>
                </div>
                {lastHash && (
                  <a
                    href={getExplorerTransactionUrl(lastHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200"
                  >
                    View on Monad explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </dl>
            </details>
          </div>

          {overlayNotice && (
            <div
              role={overlayNotice.tone === "error" ? "alert" : "status"}
              aria-live={overlayNotice.tone === "error" ? "assertive" : "polite"}
              className={`absolute bottom-3 left-3 right-3 rounded-xl border p-3 backdrop-blur-sm sm:right-auto sm:max-w-md ${
                overlayNotice.tone === "success"
                  ? "border-emerald-600 bg-emerald-950/90"
                  : overlayNotice.tone === "error"
                    ? "border-amber-600 bg-amber-950/90"
                    : "border-purple-600 bg-purple-950/90"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {overlayNotice.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : overlayNotice.tone === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                ) : (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-purple-300" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white">
                    {overlayNotice.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate-200">
                    {overlayNotice.body}
                  </p>
                </div>
              </div>
            </div>
          )}
        </KickStreamPlayer>

        <form onSubmit={handleSendReaction}>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {EMOTES.map((emote) => {
              const isSelected = selectedEmote.id === emote.id;
              const [amountValue, amountUnit] = emote.displayAmount.split(" ");

              return (
                <button
                  type="button"
                  key={emote.id}
                  onClick={() => setSelectedEmote(emote)}
                  disabled={isActivePayment}
                  aria-pressed={isSelected}
                  className={`flex min-h-44 flex-col items-center justify-center rounded-[20px] border px-3 py-5 transition-all disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-48 ${
                    isSelected
                      ? "border-purple-400 bg-purple-600/15 shadow-lg shadow-purple-500/10"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                  }`}
                >
                  <span className="text-[56px] leading-none sm:text-[64px]">
                    {emote.emoji}
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate-300">
                    {emote.name}
                  </span>
                  <span className="mt-0.5 text-xl font-extrabold text-white">
                    {amountValue}{" "}
                    <span className="text-[13px] font-bold text-slate-400">
                      {amountUnit}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={!canSendReaction}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-5 py-3.5 text-sm font-bold shadow-lg transition-all ${selectedEmote.color} hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isActivePayment ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sendButtonLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
