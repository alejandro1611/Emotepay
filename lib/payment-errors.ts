import type { Messages } from "@/lib/i18n/messages";

/**
 * Stable, locale-independent payment error codes. UI state stores these codes
 * (not English strings) so messages retranslate when the language changes and
 * internal server details are never rendered raw.
 */
export type PaymentErrorCode =
  | keyof Messages["errors"]
  | keyof Messages["readiness"];

export type PaymentError = {
  code: PaymentErrorCode;
  /**
   * Pre-formatted display amount required by codes such as
   * "insufficient-usdc-amount". Always a display label, never used in
   * transaction logic.
   */
  amountLabel?: string;
};

export function paymentError(
  code: PaymentErrorCode,
  amountLabel?: string,
): PaymentError {
  return amountLabel ? { code, amountLabel } : { code };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Maps wallet/RPC errors thrown while signing or relaying to stable codes.
 */
export function getTransactionErrorCode(
  error: unknown,
): keyof Messages["errors"] {
  const message = getErrorMessage(error).toLowerCase();

  if (
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected")
  ) {
    return "cancelled";
  }

  if (message.includes("insufficient") || message.includes("exceeds balance")) {
    return "insufficient-usdc";
  }

  if (message.includes("revert")) {
    return "payment-rejected";
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("rpc")
  ) {
    return "network-unreachable";
  }

  return "send-failed";
}

/**
 * Maps the relayer's English error strings (an API contract that stays in
 * English) to stable codes. Unknown internal errors collapse to a generic
 * code so they are never shown verbatim to viewers.
 *
 * `status` is the optional machine-readable hint the relayer includes in
 * error bodies ("pending" | "unknown"); it is authoritative over the message.
 */
export function getRelayErrorCode(
  message: string | undefined,
  status?: string | null,
): keyof Messages["errors"] {
  if (status === "pending") {
    return "relayer-pending";
  }

  if (status === "unknown") {
    return "relayer-unknown-status";
  }

  const normalized = (message ?? "").toLowerCase();

  if (normalized.includes("too many donation relay requests")) {
    return "relayer-rate-limited";
  }

  if (normalized.includes("already being relayed")) {
    return "relayer-pending";
  }

  if (normalized.includes("unknown relay status") || normalized.includes("relay status is unknown")) {
    return "relayer-unknown-status";
  }

  if (normalized.includes("insufficient usdc balance")) {
    return "insufficient-usdc";
  }

  if (normalized.includes("expired") || normalized.includes("invalid validity window")) {
    return "authorization-expired";
  }

  if (normalized.includes("not valid yet")) {
    return "authorization-not-yet-valid";
  }

  if (normalized.includes("already been used") || normalized.includes("cancelled")) {
    return "authorization-used";
  }

  if (normalized.includes("signature")) {
    return "signature-invalid";
  }

  return "relayer-failed";
}

/**
 * Renders a PaymentError with the current locale's messages.
 */
export function renderPaymentError(
  t: Messages,
  error: PaymentError,
): string {
  const entry: unknown =
    error.code in t.errors
      ? t.errors[error.code as keyof Messages["errors"]]
      : t.readiness[error.code as keyof Messages["readiness"]];

  if (typeof entry === "function") {
    return (entry as (amountLabel: string) => string)(
      error.amountLabel ?? "",
    );
  }

  return typeof entry === "string" ? entry : t.errors["send-failed"];
}
