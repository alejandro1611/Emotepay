import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAuthorizationWindowError,
  getRelayAuthorizationKey,
  parseUnsignedDecimalString,
  RelayedAuthorizationMemory,
} from "../lib/relay-donation-preflight";
import {
  createReceiveAuthorizationSigningMessage,
  createRelayDonationRequestPayload,
} from "../lib/usdc-authorization";

describe("relay donation preflights", function () {
  const donor = "0x0000000000000000000000000000000000000001";
  const nonce =
    "0x0000000000000000000000000000000000000000000000000000000000000002";

  it("rejects expired authorizations before relayer broadcast", function () {
    assert.equal(
      getAuthorizationWindowError({
        currentTime: 100n,
        validAfter: 0n,
        validBefore: 100n,
      }),
      "Authorization is expired or has an invalid validity window.",
    );
  });

  it("rejects not-yet-valid authorizations before relayer broadcast", function () {
    assert.equal(
      getAuthorizationWindowError({
        currentTime: 100n,
        validAfter: 101n,
        validBefore: 200n,
      }),
      "Authorization is not valid yet.",
    );
  });

  it("accepts the current EIP-3009 validity window", function () {
    assert.equal(
      getAuthorizationWindowError({
        currentTime: 100n,
        validAfter: 99n,
        validBefore: 200n,
      }),
      null,
    );
  });

  it("deduplicates concurrent donor and nonce relay attempts", function () {
    const memory = new RelayedAuthorizationMemory();
    const key = getRelayAuthorizationKey(donor, nonce);

    assert.equal(memory.lock(key), true);
    assert.equal(memory.isPending(key), true);
    assert.equal(memory.lock(key), false);

    memory.unlock(key);

    assert.equal(memory.isPending(key), false);
    assert.equal(memory.lock(key), true);
  });

  it("returns the retained transaction hash instead of broadcasting twice", function () {
    const memory = new RelayedAuthorizationMemory();
    const key = getRelayAuthorizationKey(donor, nonce);
    const relayed = {
      hash: "0x0000000000000000000000000000000000000000000000000000000000000003",
      amount: "100000",
      nonce,
    } as const;

    memory.remember(key, relayed);

    assert.deepEqual(memory.getRelayed(key), relayed);
  });

  it("serializes the V3 signing message and relay request without raw bigint values", function () {
    const validAfter = 1_700_000_000n;
    const validBefore = 1_700_000_300n;
    const signingMessage = createReceiveAuthorizationSigningMessage({
      from: donor,
      to: "0x0000000000000000000000000000000000000003",
      value: 100_000n,
      validAfter,
      validBefore,
      nonce,
    });
    const relayPayload = createRelayDonationRequestPayload({
      contractAddress: "0x0000000000000000000000000000000000000003",
      usdcAddress: "0x0000000000000000000000000000000000000004",
      donor,
      creator: "0x0000000000000000000000000000000000000005",
      emoteId: 1n,
      validAfter,
      validBefore,
      randomSalt:
        "0x0000000000000000000000000000000000000000000000000000000000000006",
      signature:
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    });

    assert.doesNotThrow(() => JSON.stringify(signingMessage));
    assert.doesNotThrow(() => JSON.stringify(relayPayload));
    assert.equal(signingMessage.value, "100000");
    assert.equal(signingMessage.validAfter, validAfter.toString());
    assert.equal(signingMessage.validBefore, validBefore.toString());
    assert.equal(parseUnsignedDecimalString(relayPayload.emoteId, "emoteId"), 1n);
    assert.equal(
      parseUnsignedDecimalString(relayPayload.validAfter, "validAfter"),
      validAfter,
    );
    assert.equal(
      parseUnsignedDecimalString(relayPayload.validBefore, "validBefore"),
      validBefore,
    );
  });

  it("rejects malformed relay numeric strings", function () {
    assert.throws(
      () => parseUnsignedDecimalString("1.5", "validAfter"),
      /validAfter must be an unsigned integer string/,
    );
    assert.throws(
      () => parseUnsignedDecimalString(1n, "validBefore"),
      /validBefore must be an unsigned integer string/,
    );
  });
});
