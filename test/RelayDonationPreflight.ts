import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAuthorizationWindowError,
  parseUnsignedDecimalString,
} from "../lib/relay-donation-preflight";
import {
  getRelayCoordinationKeys,
  getRelayLockTtlSeconds,
  releaseRelayLockIfOwner,
  type RelayRedisStore,
} from "../lib/relay-donation-security";
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

  it("builds distributed relay coordination keys from chain, contract, donor, and nonce", function () {
    const keys = getRelayCoordinationKeys({
      chainId: 10143,
      contractAddress: "0x0000000000000000000000000000000000000003",
      donor,
      nonce,
    });

    assert.match(keys.identity, /^10143:0x0000000000000000000000000000000000000003:/);
    assert.match(keys.lockKey, /:lock$/);
    assert.match(keys.resultKey, /:result$/);
  });

  it("keeps relay locks beyond the authorization window", function () {
    assert.equal(
      getRelayLockTtlSeconds({
        currentTime: 100n,
        validBefore: 200n,
      }),
      900,
    );
    assert.equal(
      getRelayLockTtlSeconds({
        currentTime: 100n,
        validBefore: 2_000n,
      }),
      2_500,
    );
  });

  it("only releases distributed relay locks for their owner", async function () {
    const values = new Map<string, unknown>([["lock", "owner-a"]]);
    const redis: RelayRedisStore = {
      async get<TData>(key: string) {
        return (values.get(key) as TData | undefined) ?? null;
      },
      async set<TData>(key: string, value: TData) {
        values.set(key, value);
        return "OK";
      },
      async eval<TResult>(_script: string, keys: string[], args: string[]) {
        if (values.get(keys[0]) === args[0]) {
          values.delete(keys[0]);
          return 1 as TResult;
        }

        return 0 as TResult;
      },
    };

    assert.equal(
      await releaseRelayLockIfOwner({
        redis,
        lockKey: "lock",
        owner: "owner-b",
      }),
      0,
    );
    assert.equal(values.get("lock"), "owner-a");
    assert.equal(
      await releaseRelayLockIfOwner({
        redis,
        lockKey: "lock",
        owner: "owner-a",
      }),
      1,
    );
    assert.equal(values.has("lock"), false);
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
