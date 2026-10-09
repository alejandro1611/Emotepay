import { Ratelimit } from "@upstash/ratelimit";
import type { Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Address, Hex } from "viem";

export const RELAY_COORDINATION_PREFIX = "emotepay:relay:v1";
export const RELAY_RATE_LIMIT_PREFIX = "emotepay:relay:rate:v1";
export const DEFAULT_RELAY_IP_RATE_LIMIT = 20;
export const DEFAULT_RELAY_DONOR_RATE_LIMIT = 5;
export const DEFAULT_RELAY_RATE_LIMIT_WINDOW = "60 s";
export const MIN_RELAY_LOCK_TTL_SECONDS = 15 * 60;
export const RELAY_LOCK_BUFFER_SECONDS = 10 * 60;
export const RELAY_RESULT_TTL_SECONDS = 24 * 60 * 60;

export type RelayRateLimitResult = {
  success: boolean;
  reset?: number;
};

export type RelayRateLimiter = {
  limit(identifier: string): Promise<RelayRateLimitResult>;
};

export type StoredRelayResult = {
  status: "submitted";
  hash: Hex;
  amount: string;
  nonce: Hex;
  updatedAt: number;
};

export type StoredRelayUnknown = {
  status: "unknown";
  nonce: Hex;
  owner: string;
  updatedAt: number;
  reason: "ambiguous-broadcast";
};

export type StoredRelayRecord = StoredRelayResult | StoredRelayUnknown;

export type RelayRedisStore = {
  get<TData>(key: string): Promise<TData | null>;
  set<TData>(
    key: string,
    value: TData,
    options?: {
      ex?: number;
      nx?: true;
    },
  ): Promise<"OK" | TData | null>;
  eval<TResult>(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<TResult>;
};

export type RelayCoordinationKeys = {
  identity: string;
  lockKey: string;
  resultKey: string;
};

export type RelaySecurity = {
  redis: RelayRedisStore;
  ipLimiter: RelayRateLimiter;
  donorLimiter: RelayRateLimiter;
};

type RelayRateLimitEnvironment = Record<string, string | undefined> & {
  RELAY_IP_RATE_LIMIT?: string;
  RELAY_DONOR_RATE_LIMIT?: string;
  RELAY_RATE_LIMIT_WINDOW?: string;
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRelayRateLimitConfig(
  environment: RelayRateLimitEnvironment = process.env,
) {
  return {
    ipLimit: parsePositiveInteger(
      environment.RELAY_IP_RATE_LIMIT,
      DEFAULT_RELAY_IP_RATE_LIMIT,
    ),
    donorLimit: parsePositiveInteger(
      environment.RELAY_DONOR_RATE_LIMIT,
      DEFAULT_RELAY_DONOR_RATE_LIMIT,
    ),
    window: (environment.RELAY_RATE_LIMIT_WINDOW ||
      DEFAULT_RELAY_RATE_LIMIT_WINDOW) as Duration,
  };
}

export function createRelaySecurityFromEnv(): RelaySecurity {
  if (
    !process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    !process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  ) {
    throw new Error("Redis coordination is not configured.");
  }

  const redis = Redis.fromEnv();
  const { ipLimit, donorLimit, window } = getRelayRateLimitConfig();

  return {
    redis,
    ipLimiter: new Ratelimit({
      redis,
      prefix: `${RELAY_RATE_LIMIT_PREFIX}:ip`,
      limiter: Ratelimit.fixedWindow(ipLimit, window),
    }),
    donorLimiter: new Ratelimit({
      redis,
      prefix: `${RELAY_RATE_LIMIT_PREFIX}:donor`,
      limiter: Ratelimit.fixedWindow(donorLimit, window),
    }),
  };
}

function normalizeKeyPart(value: string | number | bigint) {
  return String(value).toLowerCase();
}

export function getRelayCoordinationKeys({
  chainId,
  contractAddress,
  donor,
  nonce,
}: {
  chainId: number;
  contractAddress: Address;
  donor: Address;
  nonce: Hex;
}): RelayCoordinationKeys {
  const identity = [
    normalizeKeyPart(chainId),
    normalizeKeyPart(contractAddress),
    normalizeKeyPart(donor),
    normalizeKeyPart(nonce),
  ].join(":");

  return {
    identity,
    lockKey: `${RELAY_COORDINATION_PREFIX}:${identity}:lock`,
    resultKey: `${RELAY_COORDINATION_PREFIX}:${identity}:result`,
  };
}

export function createRelayLockOwner() {
  return crypto.randomUUID();
}

export function getRelayLockTtlSeconds({
  currentTime,
  validBefore,
}: {
  currentTime: bigint;
  validBefore: bigint;
}) {
  const secondsUntilExpiry =
    validBefore > currentTime ? Number(validBefore - currentTime) : 0;

  return Math.max(
    MIN_RELAY_LOCK_TTL_SECONDS,
    secondsUntilExpiry + RELAY_LOCK_BUFFER_SECONDS,
  );
}

export async function acquireRelayLock({
  redis,
  lockKey,
  owner,
  ttlSeconds,
}: {
  redis: RelayRedisStore;
  lockKey: string;
  owner: string;
  ttlSeconds: number;
}) {
  const result = await redis.set(lockKey, owner, {
    ex: ttlSeconds,
    nx: true,
  });

  return result === "OK";
}

export async function releaseRelayLockIfOwner({
  redis,
  lockKey,
  owner,
}: {
  redis: RelayRedisStore;
  lockKey: string;
  owner: string;
}) {
  return redis.eval<number>(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [lockKey],
    [owner],
  );
}

export async function rememberRelayResult({
  redis,
  resultKey,
  result,
}: {
  redis: RelayRedisStore;
  resultKey: string;
  result: StoredRelayRecord;
}) {
  await redis.set(resultKey, result, {
    ex: RELAY_RESULT_TTL_SECONDS,
  });
}

export function getTrustedClientIdentifier({
  headers,
  isVercel,
}: {
  headers: Headers;
  isVercel: boolean;
}) {
  if (!isVercel) {
    return "local-development";
  }

  const forwardedFor =
    headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim();

  return clientIp || null;
}
