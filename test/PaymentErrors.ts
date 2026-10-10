import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getRelayErrorCode,
  getTransactionErrorCode,
  renderPaymentError,
} from "../lib/payment-errors";
import { en } from "../lib/i18n/messages/en";
import { es } from "../lib/i18n/messages/es";

describe("transaction error codes", function () {
  it("maps wallet rejections to the cancelled code", function () {
    assert.equal(
      getTransactionErrorCode(new Error("User rejected the request")),
      "cancelled",
    );
    assert.equal(
      getTransactionErrorCode(new Error("user denied transaction")),
      "cancelled",
    );
  });

  it("maps insufficient balance errors to the insufficient-usdc code", function () {
    assert.equal(
      getTransactionErrorCode(new Error("insufficient funds for transfer")),
      "insufficient-usdc",
    );
    assert.equal(
      getTransactionErrorCode(new Error("transfer amount exceeds balance")),
      "insufficient-usdc",
    );
  });

  it("maps contract reverts to the payment-rejected code", function () {
    assert.equal(
      getTransactionErrorCode(new Error("execution reverted")),
      "payment-rejected",
    );
  });

  it("maps connectivity failures to the network-unreachable code", function () {
    assert.equal(
      getTransactionErrorCode(new Error("fetch failed")),
      "network-unreachable",
    );
    assert.equal(
      getTransactionErrorCode(new Error("RPC request failed")),
      "network-unreachable",
    );
  });

  it("keeps the original precedence: rejection wins over network errors", function () {
    assert.equal(
      getTransactionErrorCode(new Error("user rejected network request")),
      "cancelled",
    );
    assert.equal(
      getTransactionErrorCode(new Error("insufficient funds on fetch")),
      "insufficient-usdc",
    );
  });

  it("falls back to a generic code for unknown errors", function () {
    assert.equal(getTransactionErrorCode(new Error("boom")), "send-failed");
    assert.equal(getTransactionErrorCode("boom"), "send-failed");
    assert.equal(getTransactionErrorCode(undefined), "send-failed");
  });
});

describe("relayer error codes", function () {
  it("maps rate limiting to relayer-rate-limited", function () {
    assert.equal(
      getRelayErrorCode(
        "Too many donation relay requests. Please wait before trying again.",
      ),
      "relayer-rate-limited",
    );
  });

  it("maps an in-flight authorization to relayer-pending", function () {
    assert.equal(
      getRelayErrorCode("This donation authorization is already being relayed."),
      "relayer-pending",
    );
  });

  it("maps unknown relay status to relayer-unknown-status", function () {
    assert.equal(
      getRelayErrorCode(
        "This donation authorization has an unknown relay status. Please wait before signing a new authorization.",
      ),
      "relayer-unknown-status",
    );
    assert.equal(
      getRelayErrorCode(
        "Donation relay status is unknown. Please wait before signing a new authorization.",
      ),
      "relayer-unknown-status",
    );
  });

  it("maps insufficient donor balance to insufficient-usdc, not to a generic failure", function () {
    assert.equal(
      getRelayErrorCode("Donor has insufficient USDC balance."),
      "insufficient-usdc",
    );
  });

  it("keeps expired authorizations and invalid signatures as distinct codes", function () {
    assert.equal(
      getRelayErrorCode(
        "Authorization is expired or has an invalid validity window.",
      ),
      "authorization-expired",
    );
    assert.equal(
      getRelayErrorCode("Authorization is not valid yet."),
      "authorization-not-yet-valid",
    );
    assert.equal(
      getRelayErrorCode("Invalid USDC receive authorization signature."),
      "signature-invalid",
    );
    assert.equal(
      getRelayErrorCode("signature must be a hex value."),
      "signature-invalid",
    );
    assert.notEqual(
      getRelayErrorCode("Invalid USDC receive authorization signature."),
      getRelayErrorCode(
        "Authorization is expired or has an invalid validity window.",
      ),
    );
  });

  it("maps spent authorizations to authorization-used", function () {
    assert.equal(
      getRelayErrorCode(
        "USDC authorization has already been used or cancelled.",
      ),
      "authorization-used",
    );
  });

  it("prefers the response status hint over the message text", function () {
    assert.equal(
      getRelayErrorCode(
        "Donation was submitted, but the relayer could not persist its status. Please check the transaction before retrying.",
        "unknown",
      ),
      "relayer-unknown-status",
    );
    assert.equal(
      getRelayErrorCode("unrelated message", "pending"),
      "relayer-pending",
    );
  });

  it("collapses internal and unknown server errors to relayer-failed", function () {
    for (const message of [
      "Relayer could not submit this donation.",
      "Donation simulation failed.",
      "EmotePay relayer is not configured.",
      "EmotePay relayer security is not configured.",
      "Redis coordination is unavailable.",
      "Unexpected EmotePay contract address.",
      "This relayer only sponsors the configured creator.",
      "something entirely unexpected",
    ]) {
      assert.equal(getRelayErrorCode(message), "relayer-failed", message);
    }
  });

  it("never returns the raw server message as a code", function () {
    const code = getRelayErrorCode("PrismaClientKnownRequestError: P2002");
    assert.equal(code, "relayer-failed");
  });
});

describe("payment error rendering", function () {
  it("renders string messages in both locales", function () {
    const error = { code: "cancelled" } as const;

    assert.equal(
      renderPaymentError(en, error),
      "Cancelled. Nothing was sent.",
    );
    assert.equal(renderPaymentError(es, error), "Cancelado. No se envió nada.");
  });

  it("interpolates parameterized messages", function () {
    const error = {
      code: "insufficient-usdc-amount",
      amountLabel: "0.10 USDC",
    } as const;

    assert.equal(
      renderPaymentError(en, error),
      "Your embedded wallet needs at least 0.10 USDC to send this reaction.",
    );
    assert.equal(
      renderPaymentError(es, error),
      "Tu wallet integrada necesita al menos 0.10 USDC para enviar esta reacción.",
    );
  });

  it("has a translated message for every error code the mapper can return", function () {
    const codes = [
      getTransactionErrorCode(new Error("anything")),
      getRelayErrorCode("anything"),
      "cancelled",
      "insufficient-usdc",
      "insufficient-usdc-amount",
      "relayer-rate-limited",
      "relayer-pending",
      "relayer-unknown-status",
      "authorization-expired",
      "authorization-not-yet-valid",
      "authorization-used",
      "signature-invalid",
      "tx-not-completed",
      "relayer-failed",
      "send-failed",
      "payment-rejected",
      "network-unreachable",
    ] as const;

    for (const locale of [en, es]) {
      for (const code of codes) {
        const message = renderPaymentError(locale, { code });
        assert.equal(typeof message, "string");
        assert.notEqual(message.length, 0, `${code} has no message`);
      }
    }
  });
});
