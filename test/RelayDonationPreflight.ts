import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAuthorizationWindowError,
  getRelayAuthorizationKey,
  RelayedAuthorizationMemory,
} from "../lib/relay-donation-preflight";

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
});
