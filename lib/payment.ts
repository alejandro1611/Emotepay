import type { CreatorConfigurationStatus } from "@/lib/creator";
import type { ContractConfigurationStatus } from "@/lib/contracts";

export type PaymentState =
  | { status: "idle" }
  | { status: "ready" }
  | { status: "pending"; hash?: `0x${string}` }
  | { status: "success"; reference?: string }
  | { status: "error"; reason: string };

type PaymentReadinessInput = {
  authReady: boolean;
  authenticated: boolean;
  creatorStatus: CreatorConfigurationStatus;
  contractStatus?: ContractConfigurationStatus;
  walletsReady?: boolean;
  hasEmbeddedWallet?: boolean;
  isSelfDonation?: boolean;
};

export function getPaymentReadinessState({
  authReady,
  authenticated,
  creatorStatus,
  contractStatus = "ready",
  walletsReady = true,
  hasEmbeddedWallet = true,
  isSelfDonation = false,
}: PaymentReadinessInput): PaymentState {
  if (!authReady) {
    return { status: "idle" };
  }

  if (!authenticated) {
    return { status: "idle" };
  }

  if (!walletsReady) {
    return { status: "idle" };
  }

  if (!hasEmbeddedWallet) {
    return {
      status: "error",
      reason: "Embedded wallet is not ready.",
    };
  }

  if (creatorStatus === "missing-wallet") {
    return {
      status: "error",
      reason: "Creator wallet is not configured.",
    };
  }

  if (creatorStatus === "invalid-wallet") {
    return {
      status: "error",
      reason: "Creator wallet configuration is invalid.",
    };
  }

  if (contractStatus === "missing-address") {
    return {
      status: "error",
      reason: "EmotePay contract address is not configured.",
    };
  }

  if (contractStatus === "invalid-address") {
    return {
      status: "error",
      reason: "EmotePay contract address is invalid.",
    };
  }

  if (isSelfDonation) {
    return {
      status: "error",
      reason: "You can't send a reaction to yourself.",
    };
  }

  return { status: "ready" };
}
