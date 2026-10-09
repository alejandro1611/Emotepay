export const MAX_RELAY_REQUEST_BYTES = 4096;

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
