import type { Address, Hex } from "viem";

export const MAX_RELAY_REQUEST_BYTES = 4096;
export const MAX_RETAINED_RELAY_RESULTS = 500;

export function getRelayAuthorizationKey(donor: Address, nonce: Hex) {
  return `${donor.toLowerCase()}:${nonce.toLowerCase()}`;
}

export function getAuthorizationWindowError({
  currentTime,
  validAfter,
  validBefore,
}: {
  currentTime: bigint;
  validAfter: bigint;
  validBefore: bigint;
}) {
  if (validBefore <= validAfter || currentTime >= validBefore) {
    return "Authorization is expired or has an invalid validity window.";
  }

  if (validAfter > currentTime) {
    return "Authorization is not valid yet.";
  }

  return null;
}

export function parseUnsignedDecimalString(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be an unsigned integer string.`);
  }

  return BigInt(value);
}

export class RelayedAuthorizationMemory {
  private readonly pendingAuthorizations = new Set<string>();
  private readonly relayedAuthorizationHashes = new Map<
    string,
    { hash: Hex; amount: string; nonce: Hex }
  >();

  getRelayed(key: string) {
    return this.relayedAuthorizationHashes.get(key);
  }

  isPending(key: string) {
    return this.pendingAuthorizations.has(key);
  }

  lock(key: string) {
    if (this.pendingAuthorizations.has(key)) {
      return false;
    }

    this.pendingAuthorizations.add(key);
    return true;
  }

  unlock(key: string) {
    this.pendingAuthorizations.delete(key);
  }

  remember(key: string, result: { hash: Hex; amount: string; nonce: Hex }) {
    this.relayedAuthorizationHashes.set(key, result);

    if (this.relayedAuthorizationHashes.size <= MAX_RETAINED_RELAY_RESULTS) {
      return;
    }

    const oldestKey = this.relayedAuthorizationHashes.keys().next().value;

    if (oldestKey) {
      this.relayedAuthorizationHashes.delete(oldestKey);
    }
  }
}
