import type { Address } from "viem";

export const INSUFFICIENT_USDC_REASON =
  "Fund your embedded wallet to send this reaction.";

export type PaymentBalanceSnapshot = {
  walletAddress: Address;
  usdcAddress: Address;
  usdcBalance: bigint;
  usdcDecimals: number;
  contractPrice: bigint;
  checkedOnchainId: number;
};

export type PaymentBalanceReadyState = PaymentBalanceSnapshot & {
  status: "ready";
};

export type PaymentBalanceCheckState =
  | { status: "idle" }
  | {
      status: "checking";
      walletAddress?: Address;
      checkedOnchainId?: number;
    }
  | PaymentBalanceReadyState
  | (PaymentBalanceSnapshot & { status: "insufficient"; reason: string })
  | {
      status: "error";
      reason: string;
      walletAddress?: Address;
      checkedOnchainId?: number;
    };

export function getPaymentBalanceCheckState(
  snapshot: PaymentBalanceSnapshot,
): PaymentBalanceReadyState | (PaymentBalanceSnapshot & {
  status: "insufficient";
  reason: string;
}) {
  if (snapshot.usdcBalance < snapshot.contractPrice) {
    return {
      ...snapshot,
      status: "insufficient",
      reason: INSUFFICIENT_USDC_REASON,
    };
  }

  return {
    ...snapshot,
    status: "ready",
  };
}

export function isBalanceReadyForEmote(
  balanceCheck: PaymentBalanceCheckState,
  walletAddress: Address,
  onchainId: number,
): balanceCheck is PaymentBalanceReadyState {
  return (
    balanceCheck.status === "ready" &&
    balanceCheck.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
    balanceCheck.checkedOnchainId === onchainId
  );
}

export function isInsufficientUsdcReason(reason: string) {
  return (
    reason === INSUFFICIENT_USDC_REASON ||
    reason.startsWith("Your embedded wallet needs at least ")
  );
}

export function shouldApplyBalanceResponse({
  currentRequestId,
  responseRequestId,
  currentWalletAddress,
  responseWalletAddress,
}: {
  currentRequestId: number;
  responseRequestId: number;
  currentWalletAddress?: Address;
  responseWalletAddress: Address;
}) {
  return (
    currentRequestId === responseRequestId &&
    currentWalletAddress?.toLowerCase() === responseWalletAddress.toLowerCase()
  );
}

export function formatTokenAmount({
  amount,
  decimals,
  minimumFractionDigits = 2,
  maximumFractionDigits = 4,
}: {
  amount: bigint;
  decimals: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}) {
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
  const fullAmount = amount < 0n ? -amount : amount;
  const raw = fullAmount.toString().padStart(safeDecimals + 1, "0");
  const whole =
    safeDecimals === 0 ? raw : raw.slice(0, Math.max(1, raw.length - safeDecimals));
  const fraction = safeDecimals === 0 ? "" : raw.slice(-safeDecimals);
  const visibleFraction = fraction
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  const paddedFraction = visibleFraction.padEnd(minimumFractionDigits, "0");
  const sign = amount < 0n ? "-" : "";

  if (!paddedFraction) {
    return `${sign}${whole}`;
  }

  return `${sign}${whole}.${paddedFraction}`;
}
