import type { CreatorConfigurationStatus } from "@/lib/creator";
import type { ContractConfigurationStatus } from "@/lib/contracts";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Stable readiness error codes. The UI maps them to translated messages so
 * stored state retranslates when the language changes.
 */
export type PaymentReadinessErrorCode = keyof Messages["readiness"];

export type PaymentState =
  | { status: "idle" }
  | { status: "ready" }
  | { status: "pending"; hash?: `0x${string}` }
  | { status: "success"; reference?: string }
  | { status: "error"; code: PaymentReadinessErrorCode };

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
      code: "embedded-wallet-not-ready",
    };
  }

  if (creatorStatus === "missing-wallet") {
    return {
      status: "error",
      code: "creator-wallet-missing",
    };
  }

  if (creatorStatus === "invalid-wallet") {
    return {
      status: "error",
      code: "creator-wallet-invalid",
    };
  }

  if (contractStatus === "missing-address") {
    return {
      status: "error",
      code: "contract-missing",
    };
  }

  if (contractStatus === "invalid-address") {
    return {
      status: "error",
      code: "contract-invalid",
    };
  }

  if (isSelfDonation) {
    return {
      status: "error",
      code: "self-donation",
    };
  }

  return { status: "ready" };
}
