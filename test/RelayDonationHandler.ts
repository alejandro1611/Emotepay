import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import type {
  RelayRateLimiter,
  RelayRedisStore,
  RelaySecurity,
} from "../lib/relay-donation-security";

process.env.NEXT_PUBLIC_CREATOR_WALLET_ADDRESS =
  "0x0000000000000000000000000000000000000005";
process.env.NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS =
  "0x0000000000000000000000000000000000000003";

const {
  handleRelayDonationRequest,
} = await import("../lib/relay-donation-handler");
const {
  getRelayCoordinationKeys,
} = await import("../lib/relay-donation-security");

const donor = "0x0000000000000000000000000000000000000001" as Address;
const usdc = "0x0000000000000000000000000000000000000004" as Address;
const creator = "0x0000000000000000000000000000000000000005" as Address;
const contractAddress =
  "0x0000000000000000000000000000000000000003" as Address;
const unauthorizedCreator =
  "0x0000000000000000000000000000000000000006" as Address;
const nonce =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
const randomSalt =
  "0x0000000000000000000000000000000000000000000000000000000000000006" as Hex;
const signature =
  `0x${"0".repeat(63)}1${"0".repeat(63)}11b` as Hex;
const hash =
  "0x0000000000000000000000000000000000000000000000000000000000000007" as Hex;
const price = 100_000n;

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    contractAddress,
    usdcAddress: usdc,
    donor,
    creator,
    emoteId: "1",
    validAfter: "99",
    validBefore: "400",
    randomSalt,
    signature,
    ...overrides,
  };
}

class FakeRedis implements RelayRedisStore {
  readonly values = new Map<string, unknown>();
  fail = false;

  async get<TData>(key: string) {
    if (this.fail) {
      throw new Error("Redis outage");
    }

    return (this.values.get(key) as TData | undefined) ?? null;
  }

  async set<TData>(
    key: string,
    value: TData,
    options?: { ex?: number; nx?: true },
  ) {
    if (this.fail) {
      throw new Error("Redis outage");
    }

    if (options?.nx && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return "OK" as const;
  }

  async eval<TResult>(_script: string, keys: string[], args: string[]) {
    if (this.fail) {
      throw new Error("Redis outage");
    }

    if (this.values.get(keys[0]) === args[0]) {
      this.values.delete(keys[0]);
      return 1 as TResult;
    }

    return 0 as TResult;
  }
}

class FakeLimiter implements RelayRateLimiter {
  private readonly allowed: boolean;
  private readonly shouldThrow: boolean;

  constructor(allowed = true, shouldThrow = false) {
    this.allowed = allowed;
    this.shouldThrow = shouldThrow;
  }

  async limit() {
    if (this.shouldThrow) {
      throw new Error("Redis outage");
    }

    return {
      success: this.allowed,
      reset: Date.now() + 60_000,
    };
  }
}

function createSecurity({
  redis = new FakeRedis(),
  ipLimiter = new FakeLimiter(),
  donorLimiter = new FakeLimiter(),
}: {
  redis?: FakeRedis;
  ipLimiter?: RelayRateLimiter;
  donorLimiter?: RelayRateLimiter;
} = {}): RelaySecurity & { redis: FakeRedis } {
  return {
    redis,
    ipLimiter,
    donorLimiter,
  };
}

function createPublicClient({
  balance = price,
  simulateFails = false,
}: {
  balance?: bigint;
  simulateFails?: boolean;
} = {}) {
  const calls: string[] = [];

  return {
    calls,
    async getChainId() {
      calls.push("getChainId");
      return 10143;
    },
    async readContract({ functionName }: { functionName: string }) {
      calls.push(functionName);

      if (functionName === "usdc") {
        return usdc;
      }

      if (functionName === "getEmotePrice") {
        return price;
      }

      if (functionName === "computeDonationAuthorizationNonce") {
        return nonce;
      }

      if (functionName === "authorizationState") {
        return false;
      }

      if (functionName === "balanceOf") {
        return balance;
      }

      throw new Error(`Unexpected readContract ${functionName}`);
    },
    async verifyTypedData() {
      calls.push("verifyTypedData");
      return true;
    },
    async simulateContract() {
      calls.push("simulateContract");

      if (simulateFails) {
        throw new Error("simulation reverted");
      }
    },
  };
}

function createDependencies({
  security = createSecurity(),
  publicClient = createPublicClient(),
  writeContract,
}: {
  security?: RelaySecurity;
  publicClient?: ReturnType<typeof createPublicClient>;
  writeContract?: () => Promise<Hex>;
} = {}) {
  let writes = 0;

  return {
    dependencies: {
      publicClient,
      security,
      clientIdentifier: "127.0.0.1",
      nowSeconds: 100,
      environment: {
        EMOTEPAY_RELAYER_PRIVATE_KEY:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS: contractAddress,
      },
      createWalletClient: () => ({
        writeContract: async () => {
          writes += 1;
          return writeContract ? writeContract() : hash;
        },
      }),
    },
    getWrites: () => writes,
  };
}

describe("relay donation handler safety", function () {
  it("rejects rate-limited requests before blockchain RPC calls", async function () {
    const publicClient = createPublicClient();
    const { dependencies } = createDependencies({
      publicClient,
      security: createSecurity({ ipLimiter: new FakeLimiter(false) }),
    });

    const response = await handleRelayDonationRequest(
      createPayload(),
      dependencies,
    );

    assert.equal(response.status, 429);
    assert.deepEqual(publicClient.calls, []);
  });

  it("rejects sponsored donations to unauthorized creators", async function () {
    const publicClient = createPublicClient();
    const { dependencies } = createDependencies({ publicClient });

    const response = await handleRelayDonationRequest(
      createPayload({ creator: unauthorizedCreator }),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.match("error" in response.body ? response.body.error : "", /configured creator/);
    assert.deepEqual(publicClient.calls, []);
  });

  it("rejects insufficient donor USDC before simulation and submission", async function () {
    const publicClient = createPublicClient({ balance: 0n });
    const { dependencies, getWrites } = createDependencies({ publicClient });

    const response = await handleRelayDonationRequest(
      createPayload(),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.match("error" in response.body ? response.body.error : "", /insufficient/);
    assert.equal(publicClient.calls.includes("simulateContract"), false);
    assert.equal(getWrites(), 0);
  });

  it("rejects simulation failures before submission", async function () {
    const publicClient = createPublicClient({ simulateFails: true });
    const { dependencies, getWrites } = createDependencies({ publicClient });

    const response = await handleRelayDonationRequest(
      createPayload(),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.match("error" in response.body ? response.body.error : "", /simulation/);
    assert.equal(getWrites(), 0);
  });

  it("rejects two concurrent submissions using the same authorization", async function () {
    let releaseWrite: (value: Hex) => void = () => {};
    const security = createSecurity();
    let firstRequest: Promise<Awaited<ReturnType<typeof handleRelayDonationRequest>>>;
    const writeStarted = new Promise<void>((resolve) => {
      const { dependencies } = createDependencies({
        security,
        writeContract: () =>
          new Promise<Hex>((resolveWrite) => {
            releaseWrite = resolveWrite;
            resolve();
          }),
      });

      firstRequest = handleRelayDonationRequest(createPayload(), dependencies);
    });

    await writeStarted;

    const { dependencies } = createDependencies({ security });
    const second = await handleRelayDonationRequest(createPayload(), dependencies);

    releaseWrite(hash);
    await firstRequest!;

    assert.equal(second.status, 409);
    assert.equal("status" in second.body ? second.body.status : undefined, "pending");
  });

  it("returns the known transaction hash for duplicate requests", async function () {
    const { dependencies, getWrites } = createDependencies();

    const first = await handleRelayDonationRequest(createPayload(), dependencies);
    const second = await handleRelayDonationRequest(createPayload(), dependencies);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal("hash" in second.body ? second.body.hash : undefined, hash);
    assert.equal(getWrites(), 1);
  });

  it("fails closed when Redis rate limiting is unavailable", async function () {
    const publicClient = createPublicClient();
    const { dependencies } = createDependencies({
      publicClient,
      security: createSecurity({ ipLimiter: new FakeLimiter(true, true) }),
    });

    const response = await handleRelayDonationRequest(
      createPayload(),
      dependencies,
    );

    assert.equal(response.status, 503);
    assert.deepEqual(publicClient.calls, []);
  });

  it("preserves unknown state and does not release the lock after ambiguous submission", async function () {
    const security = createSecurity();
    const { dependencies } = createDependencies({
      security,
      writeContract: async () => {
        throw new Error("RPC request timed out");
      },
    });

    const response = await handleRelayDonationRequest(createPayload(), dependencies);
    const keys = getRelayCoordinationKeys({
      chainId: 10143,
      contractAddress,
      donor,
      nonce,
    });

    assert.equal(response.status, 503);
    assert.equal("status" in response.body ? response.body.status : undefined, "unknown");
    assert.equal(typeof security.redis.values.get(keys.lockKey), "string");
    assert.equal(
      (security.redis.values.get(keys.resultKey) as { status?: string })?.status,
      "unknown",
    );
  });

  it("blocks retry after function interruption when the lock exists without a result", async function () {
    const security = createSecurity();
    const keys = getRelayCoordinationKeys({
      chainId: 10143,
      contractAddress,
      donor,
      nonce,
    });
    security.redis.values.set(keys.lockKey, "previous-owner");
    const { dependencies, getWrites } = createDependencies({ security });

    const response = await handleRelayDonationRequest(createPayload(), dependencies);

    assert.equal(response.status, 409);
    assert.equal(getWrites(), 0);
  });
});
