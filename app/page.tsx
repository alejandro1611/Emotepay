"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Radio,
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
// tarjetas de reacción entren sin scroll. 19.5rem es el alto fijo de todo lo
// demás (header, paddings y tarjetas) y los 3rem compensan el padding
// horizontal, que el max-width incluye por el box-sizing de Tailwind.
const STREAM_COLUMN_MAX_WIDTH =
  "min(896px, calc((100vh - 19.5rem) * 16 / 9 + 3rem))";

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
    return "Cancelled. Nothing was sent.";
  }

  if (
    lowerMessage.includes("insufficient") ||
    lowerMessage.includes("exceeds balance")
  ) {
    return "Not enough USDC, or not enough MON for gas.";
  }

  if (lowerMessage.includes("revert")) {
    return "Monad rejected the payment.";
  }

  if (
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("rpc")
  ) {
    return "Can't reach Monad. Check your connection.";
  }

  return "Could not send it. Try again.";
}

function getReadinessMessage(reason: string) {
  if (reason.includes("Creator wallet")) {
    return "This creator can't receive reactions yet.";
  }

  if (reason.includes("contract")) {
    return "Payments aren't configured yet.";
  }

  if (reason.includes("Embedded wallet")) {
    return "Your wallet is still getting ready.";
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

function KickStreamPlayer() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
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
  const lastHash =
    transactionState.status === "approving"
      ? transactionState.hash
      : transactionState.status === "confirming"
      ? transactionState.hash
      : transactionState.status === "success"
        ? transactionState.reference
        : undefined;
  // El aviso va sobre el video, así que solo entran los estados que piden
  // atención y en el largo de una etiqueta. Los demás devuelven null: "listo
  // para enviar" quedaría fijo encima del stream sin aportar nada, y la
  // verificación de saldo dura menos de un segundo, así que un cartel que
  // parpadea molesta más de lo que informa.
  const paymentNotice = (() => {
    if (transactionState.status === "awaiting-approval") {
      return {
        tone: "active",
        title: "Waiting for you",
        body: "Approve it in your wallet.",
      };
    }

    if (transactionState.status === "approving") {
      return {
        tone: "active",
        title: "Step 1 of 2",
        body: "Approving USDC.",
      };
    }

    // Enviar y confirmar son dos estados del código, pero para el viewer son
    // el mismo paso: la reacción ya salió y está esperando a Monad.
    if (
      transactionState.status === "submitting" ||
      transactionState.status === "confirming"
    ) {
      return {
        tone: "active",
        title: "Step 2 of 2",
        body: "Confirming on Monad.",
      };
    }

    if (transactionState.status === "success") {
      if (showSuccessBanner) {
        return {
          tone: "success",
          title: "Sent",
          body: "Your reaction is live on the stream.",
        };
      }

      return null;
    }

    if (transactionState.status === "failure") {
      return {
        tone: "error",
        title: "Not sent",
        body: transactionState.reason,
      };
    }

    if (readinessState.status === "error") {
      return {
        tone: "error",
        title: "Can't send",
        body: getReadinessMessage(readinessState.reason),
      };
    }

    // No poder verificar el saldo y no tener saldo son cosas distintas, y
    // cada una pide algo distinto del viewer.
    if (effectiveBalanceCheck.status === "insufficient") {
      return {
        tone: "error",
        title: "Not enough funds",
        body: effectiveBalanceCheck.reason,
      };
    }

    if (effectiveBalanceCheck.status === "error") {
      return {
        tone: "error",
        title: "Can't check your wallet",
        body: effectiveBalanceCheck.reason,
      };
    }

    return null;
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
            reason: `Add at least ${formatUsdcAmount(
              requirements.contractPrice,
            )}.`,
          });
          return;
        }

        if (
          requirements.nativeBalance <
          requirements.requiredApprovalGasBalance
        ) {
          setBalanceCheck({
            status: "insufficient",
            reason: "Add MON for the approval gas.",
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
            reason: "Could not check your balance.",
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

  // La tarjeta es la acción: recibe su emote en vez de leer el seleccionado,
  // porque `setSelectedEmote` todavía no se aplicó cuando esto corre.
  const handleSendReaction = async (emote: Emote) => {
    setShowSuccessBanner(false);
    setSelectedEmote(emote);

    if (!canSendReaction) {
      setTransactionState({
        status: "failure",
        reason:
          balanceCheckMessage ??
          (readinessState.status === "error"
            ? getReadinessMessage(readinessState.reason)
            : // Sin sesión la readiness es "idle", no "error", así que este
              // caso hay que nombrarlo acá o cae en un genérico inútil.
              !authenticated
              ? "Sign in to send a reaction."
              : "This reaction isn't ready yet."),
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
        onchainId: emote.onchainId,
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
        onchainId: emote.onchainId,
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
        args: [demoCreator.walletAddress, BigInt(emote.onchainId)],
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
        {/* Abajo de 640 el video es demasiado chico para sostener overlays:
            los chips bajan al flujo, arriba y abajo del reproductor. */}
        <div className="relative">
          <div className="mb-2 flex items-center justify-between gap-2 sm:absolute sm:inset-x-3 sm:top-3 sm:z-10 sm:mb-0">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-purple-500 text-xs font-black text-slate-950">
                {demoCreator.displayName.slice(0, 1)}
              </div>
              <span className="truncate text-[13px] font-bold text-white">
                {demoCreator.displayName}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-emerald-700 bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Live on Kick</span>
                <span className="sm:hidden">Live</span>
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
          </div>

          <KickStreamPlayer />

          {paymentNotice && (
            <div
              role={paymentNotice.tone === "error" ? "alert" : "status"}
              aria-live={paymentNotice.tone === "error" ? "assertive" : "polite"}
              className={`mt-2 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 backdrop-blur-sm sm:absolute sm:bottom-3 sm:left-3 sm:mt-0 sm:max-w-[calc(100%-1.5rem)] ${
                paymentNotice.tone === "success"
                  ? "border-emerald-600 bg-emerald-950/90"
                  : paymentNotice.tone === "error"
                    ? "border-amber-600 bg-amber-950/90"
                    : "border-purple-600 bg-purple-950/90"
              }`}
            >
              {paymentNotice.tone === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : paymentNotice.tone === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-300" />
              )}
              <p className="min-w-0 text-[13px] text-slate-200">
                <span className="font-bold text-white">
                  {paymentNotice.title}
                </span>{" "}
                {paymentNotice.body}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {EMOTES.map((emote) => {
            const isSending = isActivePayment && selectedEmote.id === emote.id;
            const [amountValue, amountUnit] = emote.displayAmount.split(" ");

            return (
              <button
                type="button"
                key={emote.id}
                onClick={() => handleSendReaction(emote)}
                disabled={isActivePayment}
                style={{
                  // El borde se tiñe con el color de la reacción: a 40% en
                  // reposo y lleno mientras se envía.
                  borderColor: isSending ? emote.accent : `${emote.accent}66`,
                }}
                className={`relative flex min-h-44 flex-col items-center justify-center overflow-hidden rounded-[20px] border bg-slate-950/60 px-3 py-5 transition-all disabled:cursor-not-allowed sm:min-h-48 ${
                  isSending
                    ? "shadow-lg"
                    : "hover:brightness-125 active:scale-[0.98] disabled:opacity-40"
                }`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[38%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity"
                  style={{
                    background: `radial-gradient(circle, ${emote.accent}${
                      isSending ? "66" : "4d"
                    }, transparent 70%)`,
                  }}
                />
                <span className="relative text-[56px] leading-none sm:text-[64px]">
                  {emote.emoji}
                </span>
                <span className="relative mt-3 text-sm font-bold text-slate-300">
                  {emote.name}
                </span>
                {isSending ? (
                  <span className="relative mt-0.5 flex h-7 items-center">
                    <Loader2
                      className="h-5 w-5 animate-spin"
                      style={{ color: emote.accent }}
                    />
                  </span>
                ) : (
                  <span className="relative mt-0.5 text-xl font-extrabold text-white">
                    {amountValue}{" "}
                    <span className="text-[13px] font-bold text-slate-400">
                      {amountUnit}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
