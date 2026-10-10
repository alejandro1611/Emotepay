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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/LanguageProvider";
import {
  OnboardingTour,
  type OnboardingTourStep,
} from "@/components/OnboardingTour";
import {
  ReactionConfirmationModal,
  type ConfirmationPhase,
} from "@/components/ReactionConfirmationModal";
import { monadTestnet } from "@/lib/chains";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { getPrivyEmbeddedEvmWallet } from "@/lib/embedded-wallet";
import { EMOTES, type Emote } from "@/lib/emotes";
import type { KickStatusResponse } from "@/lib/kick-status";
import {
  getKickModeLabelKey,
  getResolvedKickStreamMode,
  normalizeKickStreamMode,
  type KickAutoStatus,
} from "@/lib/kick-stream-mode";
import { getPaymentReadinessState } from "@/lib/payment";
import {
  formatTokenAmount,
  getPaymentBalanceCheckState,
  isInsufficientUsdcError,
  shouldApplyBalanceResponse,
  type PaymentBalanceCheckState,
} from "@/lib/payment-balance";
import {
  getRelayErrorCode,
  getTransactionErrorCode,
  paymentError,
  renderPaymentError,
  type PaymentError,
} from "@/lib/payment-errors";
import {
  getBrowserOnboardingTourStorage,
  readOnboardingTourStatus,
  shouldAutoStartOnboardingTour,
  shouldStartManualOnboardingTour,
  type OnboardingTourStoredStatus,
} from "@/lib/onboarding-tour";
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
const kickStreamMode = normalizeKickStreamMode(
  process.env.NEXT_PUBLIC_KICK_STREAM_MODE,
);
const STREAM_COLUMN_MAX_WIDTH = "896px";
const VIEWER_SUCCESS_SOUND_SRC = "/sounds/payment-success.mp3";
const VIEWER_SUCCESS_SOUND_VOLUME = 0.35;
const AUDIO_WARNING_LOG_INTERVAL_MS = 30_000;
const KICK_STATUS_POLL_INTERVAL_MS = 45_000;
const BALANCE_REFRESH_INTERVAL_MS = 25_000;

// Tour step ids double as keys into messages.tour.steps; selectors mark the
// highlighted element. Titles/bodies are resolved per locale at render time.
const ONBOARDING_TOUR_STEP_DEFS = [
  { id: "welcome", selector: '[data-tour="stream-preview"]' },
  { id: "reactionPrice", selector: '[data-tour="reaction-card"]' },
  { id: "balance", selector: '[data-tour="usdc-balance"]' },
  { id: "fundWallet", selector: '[data-tour="fund-wallet"]' },
  { id: "confirm", selector: '[data-tour="reaction-grid"]' },
  { id: "watch", selector: '[data-tour="stream-preview"]' },
] as const;

type TransactionState =
  | { status: "idle" }
  | { status: "awaiting-approval" }
  | { status: "submitting" }
  | { status: "confirming"; hash: `0x${string}` }
  | { status: "success"; reference: `0x${string}` }
  | { status: "failure"; error: PaymentError };

type ReactionConfirmation = {
  phase: ConfirmationPhase;
  emote: Emote;
  usdcAddress: Address;
  usdcDecimals: number;
  contractPrice: bigint;
  error?: PaymentError;
  notice?: "amount-changed";
};

type RelayDonationResponse =
  | {
      hash: `0x${string}`;
      amount: string;
      nonce: Hex;
    }
  | {
      error: string;
      status?: "pending" | "unknown";
      retryAfter?: number;
      nonce?: Hex;
    };

type KickAutoState = {
  status: KickAutoStatus;
  stale: boolean;
  error?: string;
};

function getEmbeddedWallet(
  wallets: ReturnType<typeof useWallets>["wallets"],
) {
  return getPrivyEmbeddedEvmWallet(wallets);
}

function shortenAddress(address?: string | null) {
  if (!address) {
    return null;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function playSound(src: string, volume: number) {
  const audio = new Audio(src);
  audio.volume = volume;
  await audio.play();
}

function formatUsdcAmount(amount: bigint, decimals = 6) {
  return `${formatTokenAmount({
    amount,
    decimals,
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} USDC`;
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
  const [usdcBalance, usdcDecimals] = await Promise.all([
    monadPublicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [donorAddress],
    }),
    monadPublicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  return {
    usdcAddress,
    contractPrice,
    usdcBalance,
    usdcDecimals,
  };
}

function getExplorerTransactionUrl(hash: `0x${string}`) {
  return `https://testnet.monadexplorer.com/tx/${hash}`;
}

function KickStreamPlayer({
  resolvedMode,
  kickStatus,
}: {
  resolvedMode: "live" | "offline";
  kickStatus: KickAutoState;
}) {
  const { t } = useI18n();
  const showKickIframe = resolvedMode === "live" && Boolean(kickPlayerUrl);
  const previewMessage =
    kickStreamMode === "auto" && kickStatus.status === "loading"
      ? t.stream.previewMessageChecking
      : kickStreamMode === "auto" && kickStatus.status === "unknown"
        ? t.stream.previewMessageUnknown
        : t.stream.previewMessageDefault;
  const previewBadge =
    kickStreamMode === "auto" && kickStatus.status === "loading"
      ? t.stream.badgeChecking
      : kickStreamMode === "auto" && kickStatus.status === "unknown"
        ? t.stream.badgeUnknown
        : t.stream.badgeWaiting;

  return (
    <div
      data-tour="stream-preview"
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl ${
        showKickIframe
          ? "aspect-video"
          : "min-h-[18.5rem] sm:aspect-video sm:min-h-0"
      }`}
    >
      {!showKickIframe && (
        <>
          <div className="absolute inset-0 z-0 bg-slate-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(168,85,247,0.22),transparent_42%),radial-gradient(circle_at_18%_85%,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.25),rgba(2,6,23,0.96))]" />
          </div>

          <div className="relative z-0 flex min-h-[18.5rem] flex-col items-center justify-center px-4 py-7 text-center sm:absolute sm:inset-0 sm:min-h-0 sm:px-6 sm:py-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-purple-500/25 blur-2xl" />
              <div className="relative h-14 w-14 sm:h-20 sm:w-20">
                <Image
                  src="/emotepay-logo.png"
                  alt=""
                  fill
                  className="object-contain opacity-95"
                />
              </div>
            </div>
            <p className="mt-4 text-[clamp(1.35rem,6.2vw,1.875rem)] font-black leading-tight text-white sm:mt-5">
              {t.stream.previewTitle}
            </p>
            <p className="mt-2 max-w-[18rem] text-[clamp(0.82rem,3.6vw,1rem)] font-medium leading-snug text-slate-300 sm:max-w-sm">
              {previewMessage}
            </p>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase leading-tight tracking-wider text-purple-200/80 sm:text-xs">
              {t.stream.poweredBy}
            </p>
            <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold leading-none text-emerald-200 sm:mt-5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
              <span className="truncate">{previewBadge}</span>
            </div>
          </div>
          <iframe
            src="/overlay?audio=0"
            title={t.stream.overlayTitle}
            scrolling="no"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full border-0 bg-transparent"
          />
        </>
      )}

      {showKickIframe && kickPlayerUrl ? (
        <>
          <iframe
            src={kickPlayerUrl}
            title={t.stream.kickPlayerTitle}
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
                {t.stream.previewLabel}
              </p>
              <p className="hidden text-[11px] text-slate-400 sm:block">
                {kickStatus.stale ? t.stream.kickStale : t.stream.kickLive}
              </p>
            </div>
            {kickChannelUrl && (
              <a
                href={kickChannelUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-purple-400 hover:text-white"
              >
                {t.stream.openKick}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UsdcBalanceIndicator({
  authenticated,
  walletsReady,
  embeddedWalletAddress,
  balanceCheck,
  onRetry,
}: {
  authenticated: boolean;
  walletsReady: boolean;
  embeddedWalletAddress?: Address;
  balanceCheck: PaymentBalanceCheckState;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  if (!authenticated) {
    return null;
  }

  const baseClassName =
    "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-xs font-semibold text-slate-200 sm:gap-2 sm:px-3";

  if (!walletsReady || !embeddedWalletAddress || balanceCheck.status === "idle") {
    return (
      <div
        data-tour="usdc-balance"
        className={baseClassName}
        aria-label={t.balance.loadingAria}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
        <span className="hidden sm:inline">USDC</span>
      </div>
    );
  }

  if (balanceCheck.status === "checking") {
    return (
      <div
        data-tour="usdc-balance"
        className={baseClassName}
        aria-label={t.balance.loadingAria}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
        <span className="hidden sm:inline">{t.balance.checking}</span>
      </div>
    );
  }

  if (balanceCheck.status === "error") {
    return (
      <button
        type="button"
        data-tour="usdc-balance"
        onClick={onRetry}
        className={`${baseClassName} text-amber-100 transition-colors hover:border-amber-400/50 hover:text-white`}
        aria-label={t.balance.retryAria}
      >
        <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
        <span>{t.balance.retry}</span>
      </button>
    );
  }

  const balanceLabel = formatTokenAmount({
    amount: balanceCheck.usdcBalance,
    decimals: balanceCheck.usdcDecimals,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      data-tour="usdc-balance"
      className={`${baseClassName} min-w-0`}
      aria-label={t.balance.valueAria(balanceLabel)}
      title={t.balance.title(balanceLabel)}
    >
      <Wallet className="h-3.5 w-3.5 shrink-0 text-purple-300" />
      <span className="min-w-0 max-w-[4.75rem] truncate tabular-nums sm:max-w-none">
        {balanceLabel}
      </span>
      <span className="hidden text-slate-400 sm:inline">USDC</span>
    </div>
  );
}
function HomeContent() {
  const { t, hasManualPreference, clearLocale } = useI18n();
  // The built-in demo name is UI copy, not a real streamer handle, so it
  // localizes like any other string. A configured creator name passes
  // through untouched.
  const creatorDisplayName =
    demoCreator.id === "demo-creator"
      ? t.stream.creatorName
      : demoCreator.displayName;
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const [selectedEmote, setSelectedEmote] = useState<Emote>(EMOTES[0]);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    status: "idle",
  });
  const [balanceCheck, setBalanceCheck] = useState<PaymentBalanceCheckState>({
    status: "idle",
  });
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [confirmation, setConfirmation] = useState<ReactionConfirmation | null>(
    null,
  );
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const [isOnboardingTourOpen, setIsOnboardingTourOpen] = useState(false);
  const [onboardingTourStatus, setOnboardingTourStatus] =
    useState<OnboardingTourStoredStatus | null>(null);
  const [hasLoadedOnboardingTourStatus, setHasLoadedOnboardingTourStatus] =
    useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [kickAutoState, setKickAutoState] = useState<KickAutoState>({
    status: kickStreamMode === "auto" ? "loading" : "unknown",
    stale: false,
  });
  const successSoundReference = useRef<`0x${string}` | null>(null);
  const lastAudioWarningLogAt = useRef(0);
  const balanceRequestId = useRef(0);
  const currentEmbeddedWalletAddress = useRef<Address | undefined>(undefined);

  const embeddedWallet = useMemo(() => getEmbeddedWallet(wallets), [wallets]);
  const onboardingTourSteps = useMemo<OnboardingTourStep[]>(
    () =>
      ONBOARDING_TOUR_STEP_DEFS.map((definition) => ({
        id: definition.id,
        selector: definition.selector,
        title: t.tour.steps[definition.id].title,
        body: t.tour.steps[definition.id].body,
      })),
    [t],
  );
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
  const effectiveBalanceCheck: PaymentBalanceCheckState =
    readinessState.status === "ready" ? balanceCheck : { status: "idle" };
  const resolvedKickStreamMode = getResolvedKickStreamMode({
    configuredMode: kickStreamMode,
    autoStatus: kickAutoState.status,
  });
  const isLiveStreamMode = resolvedKickStreamMode === "live";
  const kickModeLabel =
    t.stream.modeLabels[
      getKickModeLabelKey({
        configuredMode: kickStreamMode,
        autoStatus: kickAutoState.status,
        stale: kickAutoState.stale,
      })
    ];
  const isActivePayment =
    transactionState.status === "awaiting-approval" ||
    transactionState.status === "submitting" ||
    transactionState.status === "confirming";
  const hasBlockingTourModal = Boolean(confirmation || isFundWalletOpen);
  const isBalanceUiReady =
    effectiveBalanceCheck.status !== "idle" &&
    effectiveBalanceCheck.status !== "checking";
  const lastHash =
    transactionState.status === "confirming"
      ? transactionState.hash
      : transactionState.status === "success"
        ? transactionState.reference
      : undefined;

  useEffect(() => {
    currentEmbeddedWalletAddress.current = embeddedWalletAddress;
  }, [embeddedWalletAddress]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setOnboardingTourStatus(
        readOnboardingTourStatus(getBrowserOnboardingTourStorage()),
      );
      setHasLoadedOnboardingTourStatus(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (
      !hasLoadedOnboardingTourStatus ||
      isOnboardingTourOpen ||
      !shouldAutoStartOnboardingTour({
        authReady: ready,
        authenticated,
        walletsReady,
        hasEmbeddedWallet: Boolean(embeddedWallet),
        balanceReady: isBalanceUiReady,
        isActivePayment,
        hasBlockingModal: hasBlockingTourModal,
        storedStatus: onboardingTourStatus,
      })
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOnboardingTourOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    authenticated,
    embeddedWallet,
    hasBlockingTourModal,
    hasLoadedOnboardingTourStatus,
    isActivePayment,
    isBalanceUiReady,
    isOnboardingTourOpen,
    onboardingTourStatus,
    ready,
    walletsReady,
  ]);

  useEffect(() => {
    if (!isOnboardingTourOpen || (!isActivePayment && !hasBlockingTourModal)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOnboardingTourOpen(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasBlockingTourModal, isActivePayment, isOnboardingTourOpen]);

  const closeOnboardingTour = (status: OnboardingTourStoredStatus) => {
    setIsOnboardingTourOpen(false);
    setOnboardingTourStatus(status);
  };
  // Solo mostramos estados que piden atención. Los demás devuelven null:
  // "listo para enviar" no aporta mucho, y la verificación de saldo dura menos
  // de un segundo, así que un cartel que parpadea molesta más de lo que informa.
  const paymentNotice = (() => {
    if (transactionState.status === "awaiting-approval") {
      return {
        tone: "active",
        title: t.notices.waitingTitle,
        body: t.notices.waitingBody,
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
        title: t.notices.sendingTitle,
        body: t.notices.sendingBody,
      };
    }

    if (transactionState.status === "success") {
      if (showSuccessBanner) {
        return {
          tone: "success",
          title: t.notices.sentTitle,
          body: t.notices.sentBody,
        };
      }

      return null;
    }

    if (transactionState.status === "failure") {
      if (
        effectiveBalanceCheck.status === "ready" &&
        isInsufficientUsdcError(transactionState.error.code)
      ) {
        return null;
      }

      return {
        tone: "error",
        title: t.notices.notSentTitle,
        body: renderPaymentError(t, transactionState.error),
      };
    }

    if (readinessState.status === "error") {
      return {
        tone: "error",
        title: t.notices.cantSendTitle,
        body: t.readiness[readinessState.code],
      };
    }

    // No poder verificar el saldo y no tener saldo son cosas distintas, y
    // cada una pide algo distinto del viewer.
    if (effectiveBalanceCheck.status === "insufficient") {
      return {
        tone: "error",
        title: t.notices.insufficientTitle,
        body: renderPaymentError(t, effectiveBalanceCheck.error),
      };
    }

    if (effectiveBalanceCheck.status === "error") {
      return {
        tone: "error",
        title: t.notices.balanceErrorTitle,
        body: renderPaymentError(t, effectiveBalanceCheck.error),
      };
    }

    return null;
  })();

  useEffect(() => {
    if (kickStreamMode !== "auto") {
      return;
    }

    let isMounted = true;
    let intervalId: number | null = null;

    const updateKickStatus = async () => {
      try {
        const response = await fetch("/api/kick/status", {
          headers: {
            accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Kick status request failed.");
        }

        const status = (await response.json()) as KickStatusResponse;

        if (!isMounted) {
          return;
        }

        setKickAutoState({
          status: status.status,
          stale: status.stale,
          error: status.error,
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setKickAutoState((current) => {
          if (current.status === "live" || current.status === "offline") {
            return {
              ...current,
              stale: true,
              error: "Kick status is temporarily unavailable.",
            };
          }

          return {
            status: "unknown",
            stale: false,
            error: "Kick status is temporarily unavailable.",
          };
        });
      }
    };

    void updateKickStatus();
    intervalId = window.setInterval(
      updateKickStatus,
      KICK_STATUS_POLL_INTERVAL_MS,
    );

    return () => {
      isMounted = false;

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

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
    const requestId = balanceRequestId.current + 1;
    balanceRequestId.current = requestId;
    let isCancelled = false;

    async function checkWalletBalance() {
      setBalanceCheck({
        status: "checking",
        walletAddress: donorAddress,
        checkedOnchainId: selectedEmote.onchainId,
      });

      try {
        const requirements = await getPaymentRequirements({
          contractAddress,
          donorAddress,
          onchainId: selectedEmote.onchainId,
        });

        if (isCancelled) {
          return;
        }

        if (
          !shouldApplyBalanceResponse({
            currentRequestId: balanceRequestId.current,
            responseRequestId: requestId,
            currentWalletAddress: currentEmbeddedWalletAddress.current,
            responseWalletAddress: donorAddress,
          })
        ) {
          return;
        }

        setBalanceCheck(
          getPaymentBalanceCheckState({
            ...requirements,
            walletAddress: donorAddress,
            checkedOnchainId: selectedEmote.onchainId,
          }),
        );
      } catch {
        if (
          !isCancelled &&
          shouldApplyBalanceResponse({
            currentRequestId: balanceRequestId.current,
            responseRequestId: requestId,
            currentWalletAddress: currentEmbeddedWalletAddress.current,
            responseWalletAddress: donorAddress,
          })
        ) {
          setBalanceCheck({
            status: "error",
            walletAddress: donorAddress,
            checkedOnchainId: selectedEmote.onchainId,
            // El título del aviso ya dice qué falló: acá va qué hacer.
            error: paymentError("balance-check-failed"),
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
    balanceRefreshNonce,
    readinessState.status,
    selectedEmote.onchainId,
  ]);

  useEffect(() => {
    if (readinessState.status !== "ready") {
      return;
    }

    const refreshBalance = () => {
      setBalanceRefreshNonce((current) => current + 1);
    };
    const refreshBalanceWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshBalance();
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshBalance();
      }
    }, BALANCE_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", refreshBalance);
    document.addEventListener("visibilitychange", refreshBalanceWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshBalance);
      document.removeEventListener("visibilitychange", refreshBalanceWhenVisible);
    };
  }, [readinessState.status, embeddedWalletAddress]);

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
  const handleSendReaction = async (emote: Emote) => {
    setShowSuccessBanner(false);
    setSelectedEmote(emote);

    if (isActivePayment) {
      return;
    }

    if (readinessState.status !== "ready") {
      setTransactionState({
        status: "failure",
        error: paymentError(
          readinessState.status === "error"
            ? readinessState.code
            : // Sin sesión la readiness es "idle", no "error", así que este
              // caso hay que nombrarlo acá o cae en un genérico inútil.
              !authenticated
              ? "sign-in-required"
              : "reaction-not-ready",
        ),
      });
      return;
    }

    if (!embeddedWallet || !demoCreator.walletAddress || !emotePayContract.address) {
      setTransactionState({
        status: "failure",
        error: paymentError("page-not-configured"),
      });
      return;
    }

    const donorAddress = embeddedWallet.address as Address;
    const requestId = balanceRequestId.current + 1;
    balanceRequestId.current = requestId;
    setTransactionState({ status: "idle" });
    setBalanceCheck({
      status: "checking",
      walletAddress: donorAddress,
      checkedOnchainId: emote.onchainId,
    });

    let requirements: Awaited<ReturnType<typeof getPaymentRequirements>>;

    try {
      requirements = await getPaymentRequirements({
        contractAddress: emotePayContract.address,
        donorAddress,
        onchainId: emote.onchainId,
      });
    } catch {
      if (
        !shouldApplyBalanceResponse({
          currentRequestId: balanceRequestId.current,
          responseRequestId: requestId,
          currentWalletAddress: currentEmbeddedWalletAddress.current,
          responseWalletAddress: donorAddress,
        })
      ) {
        return;
      }

      setBalanceCheck({
        status: "error",
        walletAddress: donorAddress,
        checkedOnchainId: emote.onchainId,
        error: paymentError("balance-check-failed"),
      });
      setTransactionState({
        status: "failure",
        error: paymentError("balance-check-failed"),
      });
      return;
    }

    if (
      !shouldApplyBalanceResponse({
        currentRequestId: balanceRequestId.current,
        responseRequestId: requestId,
        currentWalletAddress: currentEmbeddedWalletAddress.current,
        responseWalletAddress: donorAddress,
      })
    ) {
      return;
    }

    const nextBalanceCheck = getPaymentBalanceCheckState({
      ...requirements,
      walletAddress: donorAddress,
      checkedOnchainId: emote.onchainId,
    });

    setBalanceCheck(nextBalanceCheck);

    if (nextBalanceCheck.status === "insufficient") {
      setTransactionState({
        status: "failure",
        error: nextBalanceCheck.error,
      });
      return;
    }

    setConfirmation({
      phase: "review",
      emote,
      usdcAddress: nextBalanceCheck.usdcAddress,
      usdcDecimals: nextBalanceCheck.usdcDecimals,
      contractPrice: nextBalanceCheck.contractPrice,
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
      const error = paymentError("page-not-configured");
      setTransactionState({ status: "failure", error });
      setConfirmation({ ...pending, phase: "failed", error });
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
          usdcDecimals: requirements.usdcDecimals,
          contractPrice: requirements.contractPrice,
          notice: "amount-changed",
        });
        setTransactionState({ status: "idle" });
        return;
      }

      if (requirements.usdcBalance < requirements.contractPrice) {
        const error = paymentError(
          "insufficient-usdc-amount",
          formatUsdcAmount(
            requirements.contractPrice,
            requirements.usdcDecimals,
          ),
        );
        setBalanceCheck({
          status: "insufficient",
          error,
          walletAddress: donorAddress,
          usdcAddress: requirements.usdcAddress,
          usdcBalance: requirements.usdcBalance,
          usdcDecimals: requirements.usdcDecimals,
          contractPrice: requirements.contractPrice,
          checkedOnchainId: pending.emote.onchainId,
        });
        setTransactionState({
          status: "failure",
          error,
        });
        setConfirmation({ ...pending, phase: "failed", error });
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
        // Los códigos son estables; el mensaje traducido se resuelve al
        // renderizar y los errores internos del servidor nunca se muestran
        // crudos al viewer.
        const error = paymentError(
          "error" in relayResult
            ? getRelayErrorCode(relayResult.error, relayResult.status)
            : "relayer-failed",
        );
        setTransactionState({
          status: "failure",
          error,
        });
        setConfirmation((current) =>
          current ? { ...current, phase: "failed", error } : current,
        );
        return;
      }

      setTransactionState({ status: "confirming", hash: relayResult.hash });

      const receipt = await monadPublicClient.waitForTransactionReceipt({
        hash: relayResult.hash,
      });

      if (receipt.status !== "success") {
        const error = paymentError("tx-not-completed");
        setTransactionState({
          status: "failure",
          error,
        });
        setConfirmation((current) =>
          current ? { ...current, phase: "failed", error } : current,
        );
        return;
      }

      setTransactionState({ status: "success", reference: relayResult.hash });
      setConfirmation((current) =>
        current ? { ...current, phase: "delivered" } : current,
      );
      setBalanceRefreshNonce((current) => current + 1);
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
      const paymentIssue = paymentError(getTransactionErrorCode(error));
      setTransactionState({
        status: "failure",
        error: paymentIssue,
      });
      setConfirmation((current) =>
        current ? { ...current, phase: "failed", error: paymentIssue } : current,
      );
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:h-16 sm:px-6 sm:py-0">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="relative h-11 w-11 shrink-0 sm:h-14 sm:w-14">
              <Image
                src="/emotepay-logo.png"
                alt="EmotePay logo"
                fill
                priority
                className="object-contain"
              />
            </div>
            <span className="hidden truncate bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-xl font-bold tracking-tight text-transparent min-[430px]:inline">
              Emote<span className="text-purple-400">Pay</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            <div className="hidden h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-300 md:flex">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {t.common.testnet}
            </div>
            <UsdcBalanceIndicator
              authenticated={authenticated}
              walletsReady={walletsReady}
              embeddedWalletAddress={embeddedWalletAddress}
              balanceCheck={effectiveBalanceCheck}
              onRetry={() => setBalanceRefreshNonce((current) => current + 1)}
            />
            {authenticated && (
              <button
                type="button"
                data-tour="fund-wallet"
                onClick={() => setIsFundWalletOpen(true)}
                disabled={!embeddedWalletAddress}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-purple-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3"
              >
                <Wallet className="h-4 w-4 text-purple-300" />
                <span className="hidden min-[360px]:inline sm:hidden">
                  {t.fund.short}
                </span>
                <span className="hidden sm:inline">{t.fund.wallet}</span>
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
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm sm:max-w-[60%]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-purple-500 text-xs font-black text-slate-950">
                {creatorDisplayName.slice(0, 1)}
              </div>
              <span className="truncate text-[13px] font-bold text-white">
                {creatorDisplayName}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span
                className={`flex min-h-9 items-center gap-1.5 rounded-full border bg-slate-950/80 px-2.5 py-1.5 text-xs font-semibold backdrop-blur-sm sm:gap-2 sm:px-3 ${
                  isLiveStreamMode
                    ? "border-emerald-700 text-emerald-300"
                    : "border-purple-400/30 text-purple-100"
                }`}
              >
                {isLiveStreamMode && (
                  <Radio className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {kickModeLabel}
                </span>
                <span className="sm:hidden">
                  {isLiveStreamMode
                    ? t.stream.live
                    : kickAutoState.status === "loading"
                      ? t.stream.badgeChecking
                      : t.stream.demo}
                </span>
              </span>
              <details className="relative">
                <summary
                  aria-label={t.details.label}
                  className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-slate-300 backdrop-blur-sm transition-colors hover:text-white"
                >
                  <Info className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-xs shadow-2xl backdrop-blur-sm">
                  <dl className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{t.common.network}</dt>
                      <dd className="text-slate-300">
                        {monadTestnet.name} ({monadTestnet.id})
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{t.details.yourWallet}</dt>
                      <dd className="font-mono text-slate-300">
                        {shortenAddress(embeddedWalletAddress) ??
                          t.common.unavailable}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">
                        {t.details.creatorWallet}
                      </dt>
                      <dd className="font-mono text-slate-300">
                        {shortenAddress(demoCreator.walletAddress) ??
                          t.common.unavailable}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{t.details.contract}</dt>
                      <dd className="font-mono text-slate-300">
                        {shortenAddress(emotePayContract.address) ??
                          t.common.unavailable}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{t.details.usdcToken}</dt>
                      <dd className="font-mono text-slate-300">
                        {effectiveBalanceCheck.status === "ready"
                          ? (shortenAddress(effectiveBalanceCheck.usdcAddress) ??
                            t.common.unavailable)
                          : t.details.pendingCheck}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{t.details.transaction}</dt>
                      <dd className="font-mono text-slate-300">
                        {lastHash
                          ? (shortenAddress(lastHash) ?? t.common.unavailable)
                          : t.details.pendingSend}
                      </dd>
                    </div>
                    {lastHash && (
                      <a
                        href={getExplorerTransactionUrl(lastHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200"
                      >
                        {t.details.viewOnExplorer}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </dl>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        shouldStartManualOnboardingTour({
                          isActivePayment,
                          hasBlockingModal: hasBlockingTourModal,
                        })
                      ) {
                        setIsOnboardingTourOpen(true);
                      }
                    }}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-purple-400/30 bg-purple-400/10 px-3 text-xs font-bold text-purple-100 transition-colors hover:border-purple-300 hover:text-white"
                  >
                    {t.details.showTour}
                  </button>
                  <div className="mt-3 border-t border-slate-700/60 pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {t.language.switcherLabel}
                    </p>
                    <LanguageSwitcher />
                    {hasManualPreference && (
                      <button
                        type="button"
                        onClick={clearLocale}
                        className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        {t.language.useBrowser}
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </div>
          </div>

          <KickStreamPlayer
            resolvedMode={resolvedKickStreamMode}
            kickStatus={kickAutoState}
          />

          {paymentNotice && (
            <div
              role={paymentNotice.tone === "error" ? "alert" : "status"}
              aria-live={paymentNotice.tone === "error" ? "assertive" : "polite"}
              className={`mt-3 rounded-xl border p-3 backdrop-blur-sm sm:max-w-[28rem] ${
                paymentNotice.tone === "success"
                  ? "border-emerald-600 bg-emerald-950/90"
                  : paymentNotice.tone === "error"
                    ? "border-amber-600 bg-amber-950/90"
                    : "border-purple-600 bg-purple-950/90"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {paymentNotice.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : paymentNotice.tone === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                ) : (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-purple-300" />
                )}
                <p className="min-w-0 flex-1 text-[13px] leading-5 text-slate-200">
                  <span className="font-bold text-white">
                    {paymentNotice.title}
                  </span>{" "}
                  {paymentNotice.body}
                </p>
              </div>
              {effectiveBalanceCheck.status === "insufficient" && (
                <button
                  type="button"
                  onClick={() => setIsFundWalletOpen(true)}
                  disabled={!embeddedWalletAddress}
                  className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-6 sm:w-auto"
                >
                  {t.fund.wallet}
                </button>
              )}
            </div>
          )}
        </div>

        <div
          data-tour="reaction-grid"
          className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {EMOTES.map((emote) => {
            const isSending = isActivePayment && selectedEmote.id === emote.id;
            const [amountValue, amountUnit] = emote.displayAmount.split(" ");

            return (
              <button
                type="button"
                key={emote.id}
                data-tour={
                  emote.id === selectedEmote.id ? "reaction-card" : undefined
                }
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
                  {t.emotes[emote.id as keyof typeof t.emotes] ?? emote.name}
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
          amountLabel={formatUsdcAmount(
            confirmation.contractPrice,
            confirmation.usdcDecimals,
          )}
          creatorName={creatorDisplayName}
          creatorAddress={demoCreator.walletAddress}
          contractAddress={emotePayContract.address}
          usdcAddress={confirmation.usdcAddress}
          networkName={monadTestnet.name}
          chainId={monadTestnet.id}
          authorizationValiditySeconds={RECEIVE_AUTHORIZATION_VALIDITY_SECONDS}
          errorMessage={
            confirmation.error
              ? renderPaymentError(t, confirmation.error)
              : undefined
          }
          notice={
            confirmation.notice ? t.errors[confirmation.notice] : undefined
          }
          onConfirm={handleConfirmReaction}
          onDismiss={() => setConfirmation(null)}
        />
      )}

      {isFundWalletOpen && embeddedWalletAddress && (
        <FundWalletModal
          walletAddress={embeddedWalletAddress}
          networkName={monadTestnet.name}
          onDismiss={() => {
            setIsFundWalletOpen(false);
            setBalanceRefreshNonce((current) => current + 1);
          }}
        />
      )}

      <OnboardingTour
        open={isOnboardingTourOpen}
        steps={onboardingTourSteps}
        onClose={closeOnboardingTour}
      />
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
