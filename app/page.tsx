"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Radio,
  Wallet,
} from "lucide-react";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { AuthenticatedRoute } from "@/components/AuthenticatedRoute";
import { AuthButton } from "@/components/AuthButton";
import { FundWalletModal } from "@/components/FundWalletModal";
import {
  ReactionConfirmationModal,
  type ConfirmationPhase,
} from "@/components/ReactionConfirmationModal";
import { monadTestnet } from "@/lib/chains";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { EMOTES, type Emote } from "@/lib/emotes";
import { getPaymentReadinessState } from "@/lib/payment";
import {
  createReceiveAuthorizationSigningMessage,
  createRelayDonationRequestPayload,
  createReceiveAuthorizationValidity,
  RECEIVE_AUTHORIZATION_VALIDITY_SECONDS,
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
const kickChannelUrl = kickChannel
  ? `https://kick.com/${encodeURIComponent(kickChannel)}`
  : null;
const kickStreamMode =
  process.env.NEXT_PUBLIC_KICK_STREAM_MODE === "live" ? "live" : "offline";
// El ancho del video se topa contra el alto de la ventana para que las
// tarjetas de reacción entren sin scroll. 19.5rem es el alto fijo de todo lo
// demás (header, paddings y tarjetas) y los 3rem compensan el padding
// horizontal, que el max-width incluye por el box-sizing de Tailwind.
const STREAM_COLUMN_MAX_WIDTH =
  "min(896px, calc((100vh - 19.5rem) * 16 / 9 + 3rem))";
const VIEWER_SUCCESS_SOUND_SRC = "/sounds/payment-success.mp3";
const VIEWER_SUCCESS_SOUND_VOLUME = 0.35;
const AUDIO_WARNING_LOG_INTERVAL_MS = 30_000;

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

type ReactionConfirmation = {
  phase: ConfirmationPhase;
  emote: Emote;
  usdcAddress: Address;
  contractPrice: bigint;
  errorMessage?: string;
  notice?: string;
};

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

async function playSound(src: string, volume: number) {
  const audio = new Audio(src);
  audio.volume = volume;
  await audio.play();
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

function KickStreamPlayer() {
  const showKickIframe = kickStreamMode === "live" && Boolean(kickPlayerUrl);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      {!showKickIframe && (
        <>
          <div className="absolute inset-0 z-0 bg-slate-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(168,85,247,0.22),transparent_42%),radial-gradient(circle_at_18%_85%,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.25),rgba(2,6,23,0.96))]" />

            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-purple-500/25 blur-2xl" />
                <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                  <Image
                    src="/emotepay-logo.png"
                    alt=""
                    fill
                    className="object-contain opacity-95"
                  />
                </div>
              </div>
              <p className="mt-5 text-2xl font-black text-white sm:text-3xl">
                Live Reaction Preview
              </p>
              <p className="mt-2 max-w-sm text-sm font-medium text-slate-300 sm:text-base">
                Send a reaction to see it appear here.
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-purple-200/80">
                Real USDC payments on Monad Testnet
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Waiting for reactions
              </div>
            </div>
          </div>
          <iframe
            src="/overlay?audio=0"
            title="EmotePay live reaction overlay"
            scrolling="no"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full border-0 bg-transparent"
          />
        </>
      )}

      {showKickIframe && kickPlayerUrl ? (
        <>
          <iframe
            src={kickPlayerUrl}
            title="Kick livestream"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            // Abajo de unos 315px de ventana el reproductor de Kick no entra en
            // su propio documento y saca su barra de scroll. Es cross-origin, no
            // podemos tocar su CSS: esto se lo pide al navegador desde afuera.
            scrolling="no"
            className="absolute inset-0 h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">
                Stream preview
              </p>
              <p className="hidden text-[11px] text-slate-400 sm:block">
                Live mode is using the Kick player.
              </p>
            </div>
            {kickChannelUrl && (
              <a
                href={kickChannelUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-purple-400 hover:text-white"
              >
                Open Kick
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
function HomeContent() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const [selectedEmote, setSelectedEmote] = useState<Emote>(EMOTES[0]);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    status: "idle",
  });
  const [balanceCheck, setBalanceCheck] = useState<BalanceCheckState>({
    status: "idle",
  });
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [confirmation, setConfirmation] = useState<ReactionConfirmation | null>(
    null,
  );
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const successSoundReference = useRef<`0x${string}` | null>(null);
  const lastAudioWarningLogAt = useRef(0);

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
  const isLiveStreamMode = kickStreamMode === "live";
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
  const lastHash =
    transactionState.status === "confirming"
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
        body: "Sign the authorization in your wallet.",
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
        title: "Sending",
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
        title: "Not enough test USDC",
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
            reason: "Fund your embedded wallet to send this reaction.",
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
            // El título del aviso ya dice qué falló: acá va qué hacer.
            reason: "Try again in a moment.",
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

  useEffect(() => {
    if (confirmation?.phase !== "delivered") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConfirmation(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [confirmation?.phase]);

  // La tarjeta es la acción: recibe su emote en vez de leer el seleccionado,
  // porque `setSelectedEmote` todavía no se aplicó cuando esto corre.
  const handleSendReaction = (emote: Emote) => {
    setShowSuccessBanner(false);
    setSelectedEmote(emote);

    if (!canSendReaction || effectiveBalanceCheck.status !== "ready") {
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

    setTransactionState({ status: "idle" });
    setConfirmation({
      phase: "review",
      emote,
      usdcAddress: effectiveBalanceCheck.usdcAddress,
      contractPrice: effectiveBalanceCheck.contractPrice,
    });
  };

  const handleConfirmReaction = async () => {
    const pending = confirmation;

    if (
      !pending ||
      (pending.phase !== "review" && pending.phase !== "failed")
    ) {
      return;
    }

    if (!embeddedWallet || !demoCreator.walletAddress || !emotePayContract.address) {
      const reason = "This payment page is not configured yet.";
      setTransactionState({ status: "failure", reason });
      setConfirmation({ ...pending, phase: "failed", errorMessage: reason });
      return;
    }

    setConfirmation({ ...pending, phase: "signing" });
    setTransactionState({ status: "awaiting-approval" });

    try {
      await embeddedWallet.switchChain(monadTestnet.id);

      const donorAddress = embeddedWallet.address as Address;
      const requirements = await getPaymentRequirements({
        contractAddress: emotePayContract.address,
        donorAddress,
        onchainId: pending.emote.onchainId,
      });

      if (
        !isAddressEqual(requirements.usdcAddress, pending.usdcAddress) ||
        requirements.contractPrice !== pending.contractPrice
      ) {
        setConfirmation({
          phase: "review",
          emote: pending.emote,
          usdcAddress: requirements.usdcAddress,
          contractPrice: requirements.contractPrice,
          notice:
            "The reaction amount changed. Please review it again before confirming.",
        });
        setTransactionState({ status: "idle" });
        return;
      }

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
        setConfirmation({ ...pending, phase: "failed", errorMessage: reason });
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
          BigInt(pending.emote.onchainId),
          pending.contractPrice,
          randomSalt,
        ],
      });
      const authorizationMessage = createReceiveAuthorizationSigningMessage({
        from: donorAddress,
        to: emotePayContract.address,
        value: pending.contractPrice,
        validAfter,
        validBefore,
        nonce,
      });
      const { signature } = await signTypedData(
        {
          domain: {
            name: USDC_EIP712_NAME,
            version: USDC_EIP712_VERSION,
            chainId: monadTestnet.id,
            verifyingContract: pending.usdcAddress,
          },
          primaryType: "ReceiveWithAuthorization",
          types: receiveWithAuthorizationTypes,
          message: authorizationMessage,
        },
        {
          address: embeddedWallet.address,
          uiOptions: { showWalletUIs: false },
        },
      );

      setConfirmation((current) =>
        current ? { ...current, phase: "sending" } : current,
      );
      setTransactionState({ status: "submitting" });

      const relayResponse = await fetch("/api/relay-donation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(createRelayDonationRequestPayload({
          contractAddress: emotePayContract.address,
          usdcAddress: pending.usdcAddress,
          donor: donorAddress,
          creator: demoCreator.walletAddress,
          emoteId: pending.emote.onchainId,
          validAfter,
          validBefore,
          randomSalt,
          signature: signature as Hex,
        })),
      });
      const relayResult = (await relayResponse.json()) as RelayDonationResponse;

      if (!relayResponse.ok || "error" in relayResult) {
        const reason =
          "error" in relayResult
            ? relayResult.error
            : "The relayer could not submit this reaction.";
        setTransactionState({
          status: "failure",
          reason,
        });
        setConfirmation((current) =>
          current
            ? { ...current, phase: "failed", errorMessage: reason }
            : current,
        );
        return;
      }

      setTransactionState({ status: "confirming", hash: relayResult.hash });

      const receipt = await monadPublicClient.waitForTransactionReceipt({
        hash: relayResult.hash,
      });

      if (receipt.status !== "success") {
        const reason =
          "Monad did not complete this payment, so the reaction was not sent.";
        setTransactionState({
          status: "failure",
          reason,
        });
        setConfirmation((current) =>
          current
            ? { ...current, phase: "failed", errorMessage: reason }
            : current,
        );
        return;
      }

      setTransactionState({ status: "success", reference: relayResult.hash });
      setConfirmation((current) =>
        current ? { ...current, phase: "delivered" } : current,
      );
      if (successSoundReference.current !== relayResult.hash) {
        successSoundReference.current = relayResult.hash;
        void playSound(
          VIEWER_SUCCESS_SOUND_SRC,
          VIEWER_SUCCESS_SOUND_VOLUME,
        ).catch((error) => {
          const now = Date.now();

          if (
            now - lastAudioWarningLogAt.current <
            AUDIO_WARNING_LOG_INTERVAL_MS
          ) {
            return;
          }

          lastAudioWarningLogAt.current = now;
          console.warn("Payment success audio playback failed", error);
        });
      }
      setShowSuccessBanner(true);
    } catch (error) {
      const reason = getTransactionErrorMessage(error);
      setTransactionState({
        status: "failure",
        reason,
      });
      setConfirmation((current) =>
        current ? { ...current, phase: "failed", errorMessage: reason } : current,
      );
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
            {authenticated && (
              <button
                type="button"
                onClick={() => setIsFundWalletOpen(true)}
                disabled={!embeddedWalletAddress}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-purple-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wallet className="h-4 w-4 text-purple-300" />
                <span className="hidden sm:inline">Fund wallet</span>
                <span className="sm:hidden">Fund</span>
              </button>
            )}
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
          <div className="mb-2 flex items-center justify-between gap-2 sm:absolute sm:inset-x-3 sm:top-3 sm:z-30 sm:mb-0">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-purple-500 text-xs font-black text-slate-950">
                {demoCreator.displayName.slice(0, 1)}
              </div>
              <span className="truncate text-[13px] font-bold text-white">
                {demoCreator.displayName}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`flex items-center gap-2 rounded-full border bg-slate-950/80 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ${
                  isLiveStreamMode
                    ? "border-emerald-700 text-emerald-300"
                    : "border-purple-400/30 text-purple-100"
                }`}
              >
                {isLiveStreamMode && (
                  <Radio className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {isLiveStreamMode ? "Live on Kick" : "Reaction Demo"}
                </span>
                <span className="sm:hidden">
                  {isLiveStreamMode ? "Live" : "Demo"}
                </span>
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
              {effectiveBalanceCheck.status === "insufficient" && (
                <button
                  type="button"
                  onClick={() => setIsFundWalletOpen(true)}
                  disabled={!embeddedWalletAddress}
                  className="ml-auto shrink-0 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fund wallet
                </button>
              )}
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

      {confirmation && (
        <ReactionConfirmationModal
          phase={confirmation.phase}
          emote={confirmation.emote}
          amountLabel={formatUsdcAmount(confirmation.contractPrice)}
          creatorName={demoCreator.displayName}
          creatorAddress={demoCreator.walletAddress}
          contractAddress={emotePayContract.address}
          usdcAddress={confirmation.usdcAddress}
          networkName={monadTestnet.name}
          chainId={monadTestnet.id}
          authorizationValiditySeconds={RECEIVE_AUTHORIZATION_VALIDITY_SECONDS}
          errorMessage={confirmation.errorMessage}
          notice={confirmation.notice}
          onConfirm={handleConfirmReaction}
          onDismiss={() => setConfirmation(null)}
        />
      )}

      {isFundWalletOpen && embeddedWalletAddress && (
        <FundWalletModal
          walletAddress={embeddedWalletAddress}
          networkName={monadTestnet.name}
          onDismiss={() => setIsFundWalletOpen(false)}
        />
      )}
    </main>
  );
}

export default function Home() {
  return (
    <AuthenticatedRoute>
      <HomeContent />
    </AuthenticatedRoute>
  );
}
