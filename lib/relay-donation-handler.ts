import {
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chains";
import { demoCreator } from "@/lib/creator";
import { emotePayContract } from "@/lib/contracts";
import {
  getAuthorizationWindowError,
  parseUnsignedDecimalString,
} from "@/lib/relay-donation-preflight";
import {
  acquireRelayLock,
  createRelayLockOwner,
  getRelayCoordinationKeys,
  getRelayLockTtlSeconds,
  releaseRelayLockIfOwner,
  rememberRelayResult,
  type RelaySecurity,
  type StoredRelayRecord,
} from "@/lib/relay-donation-security";
import {
  receiveWithAuthorizationTypes,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
} from "@/lib/usdc-authorization";

const usdcAuthorizationAbi = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type RelayDonationResponseBody =
  | {
      hash: Hex;
      amount: string;
      nonce: Hex;
    }
  | {
      error: string;
      status?: "pending" | "unknown";
      retryAfter?: number;
      nonce?: Hex;
    };

export type RelayDonationHandlerResponse = {
  status: number;
  body: RelayDonationResponseBody;
};

type RelayDonationEnvironment = Record<string, string | undefined> & {
  EMOTEPAY_RELAYER_PRIVATE_KEY?: string;
  NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS?: string;
};

type MinimalPublicClient = {
  getChainId(): Promise<number>;
  readContract(parameters: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  verifyTypedData(parameters: {
    address: Address;
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    primaryType: "ReceiveWithAuthorization";
    types: typeof receiveWithAuthorizationTypes;
    message: {
      from: Address;
      to: Address;
      value: bigint;
      validAfter: bigint;
      validBefore: bigint;
      nonce: Hex;
    };
    signature: Hex;
  }): Promise<boolean>;
  simulateContract(parameters: {
    account: PrivateKeyAccount;
    address: Address;
    abi: typeof emotePayContract.abi;
    functionName: "donateWithAuthorization";
    args: readonly [
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      Hex,
      number,
      Hex,
      Hex,
    ];
  }): Promise<unknown>;
};

type MinimalWalletClient = {
  writeContract(parameters: {
    address: Address;
    abi: typeof emotePayContract.abi;
    functionName: "donateWithAuthorization";
    args: readonly [
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      Hex,
      number,
      Hex,
      Hex,
    ];
  }): Promise<Hex>;
};

export type RelayDonationHandlerDependencies = {
  publicClient: MinimalPublicClient;
  createWalletClient(account: PrivateKeyAccount): MinimalWalletClient;
  security: RelaySecurity;
  environment?: RelayDonationEnvironment;
  clientIdentifier: string | null;
  nowSeconds?: number;
};

function badRequest(reason: string): RelayDonationHandlerResponse {
  return {
    status: 400,
    body: { error: reason },
  };
}

function serviceUnavailable(reason: string): RelayDonationHandlerResponse {
  return {
    status: 503,
    body: { error: reason },
  };
}

function rateLimited(reset?: number): RelayDonationHandlerResponse {
  const retryAfter = reset
    ? Math.max(1, Math.ceil((reset - Date.now()) / 1000))
    : undefined;

  return {
    status: 429,
    body: {
      error: "Too many donation relay requests. Please wait before trying again.",
      retryAfter,
    },
  };
}

function parseAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${label} must be a valid address.`);
  }

  return getAddress(value);
}

function parseHex(value: unknown, label: string): Hex {
  if (
    typeof value !== "string" ||
    !value.startsWith("0x") ||
    value.length === 2
  ) {
    throw new Error(`${label} must be a hex value.`);
  }

  return value as Hex;
}

function requireHexLength(value: Hex, label: string, length: number) {
  if (value.length !== length) {
    throw new Error(`${label} has an unexpected length.`);
  }
}

function normalizePrivateKey(privateKey: string): Hex {
  return privateKey.startsWith("0x")
    ? (privateKey as Hex)
    : (`0x${privateKey}` as Hex);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isAmbiguousBroadcastError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("http request") ||
    message.includes("rpc") ||
    message.includes("connection") ||
    message.includes("socket")
  );
}

function getKnownRelayResponse(
  existingRecord: StoredRelayRecord,
): RelayDonationHandlerResponse {
  if (existingRecord.status === "submitted") {
    return {
      status: 200,
      body: {
        hash: existingRecord.hash,
        amount: existingRecord.amount,
        nonce: existingRecord.nonce,
      },
    };
  }

  return {
    status: 409,
    body: {
      error:
        "This donation authorization has an unknown relay status. Please wait before signing a new authorization.",
      status: "unknown",
      nonce: existingRecord.nonce,
    },
  };
}

async function enforceRateLimit(
  limiter: RelaySecurity["ipLimiter"],
  identifier: string,
) {
  try {
    return await limiter.limit(identifier);
  } catch {
    throw new Error("Redis rate limiting is unavailable.");
  }
}

export async function handleRelayDonationRequest(
  payload: Record<string, unknown>,
  {
    publicClient,
    createWalletClient,
    security,
    environment = process.env,
    clientIdentifier,
    nowSeconds = Math.floor(Date.now() / 1000),
  }: RelayDonationHandlerDependencies,
): Promise<RelayDonationHandlerResponse> {
  if (!clientIdentifier) {
    return serviceUnavailable("Trusted client identity is not available.");
  }

  try {
    const ipRateLimit = await enforceRateLimit(
      security.ipLimiter,
      `ip:${clientIdentifier}`,
    );

    if (!ipRateLimit.success) {
      return rateLimited(ipRateLimit.reset);
    }

    const relayerPrivateKey = environment.EMOTEPAY_RELAYER_PRIVATE_KEY;
    const configuredContractAddress =
      environment.NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS?.trim();

    if (!relayerPrivateKey) {
      return serviceUnavailable("EmotePay relayer is not configured.");
    }

    if (!configuredContractAddress) {
      return serviceUnavailable("EmotePay V3 contract address is not configured.");
    }

    if (!demoCreator.walletAddress) {
      return serviceUnavailable("Creator wallet address is not configured.");
    }

    const contractAddress = parseAddress(payload.contractAddress, "contractAddress");
    const donor = parseAddress(payload.donor, "donor");
    const creator = parseAddress(payload.creator, "creator");
    const usdcAddress = parseAddress(payload.usdcAddress, "usdcAddress");
    const randomSalt = parseHex(payload.randomSalt, "randomSalt");
    const signature = parseHex(payload.signature, "signature");
    const emoteId = parseUnsignedDecimalString(payload.emoteId, "emoteId");
    const validAfter = parseUnsignedDecimalString(payload.validAfter, "validAfter");
    const validBefore = parseUnsignedDecimalString(payload.validBefore, "validBefore");

    if (!isAddressEqual(contractAddress, getAddress(configuredContractAddress))) {
      return badRequest("Unexpected EmotePay contract address.");
    }

    if (!isAddressEqual(creator, demoCreator.walletAddress)) {
      return badRequest("This relayer only sponsors the configured creator.");
    }

    requireHexLength(randomSalt, "randomSalt", 66);
    requireHexLength(signature, "signature", 132);

    const donorRateLimit = await enforceRateLimit(
      security.donorLimiter,
      `donor:${donor.toLowerCase()}`,
    );

    if (!donorRateLimit.success) {
      return rateLimited(donorRateLimit.reset);
    }

    const [chainId, configuredUsdcAddress, price] = await Promise.all([
      publicClient.getChainId(),
      publicClient.readContract({
        address: contractAddress,
        abi: emotePayContract.abi,
        functionName: "usdc",
      }) as Promise<Address>,
      publicClient.readContract({
        address: contractAddress,
        abi: emotePayContract.abi,
        functionName: "getEmotePrice",
        args: [emoteId],
      }) as Promise<bigint>,
    ]);

    if (chainId !== monadTestnet.id) {
      return serviceUnavailable("Configured RPC is not Monad Testnet.");
    }

    if (!isAddressEqual(usdcAddress, configuredUsdcAddress)) {
      return badRequest("Unexpected USDC token address.");
    }

    const currentTime = BigInt(nowSeconds);
    const windowError = getAuthorizationWindowError({
      currentTime,
      validAfter,
      validBefore,
    });

    if (windowError) {
      return badRequest(windowError);
    }

    const nonce = (await publicClient.readContract({
      address: contractAddress,
      abi: emotePayContract.abi,
      functionName: "computeDonationAuthorizationNonce",
      args: [donor, creator, emoteId, price, randomSalt],
    })) as Hex;
    const coordinationKeys = getRelayCoordinationKeys({
      chainId,
      contractAddress,
      donor,
      nonce,
    });
    const existingRecord = await security.redis.get<StoredRelayRecord>(
      coordinationKeys.resultKey,
    );

    if (existingRecord) {
      return getKnownRelayResponse(existingRecord);
    }

    const lockOwner = createRelayLockOwner();
    const lockTtlSeconds = getRelayLockTtlSeconds({
      currentTime,
      validBefore,
    });
    const hasLock = await acquireRelayLock({
      redis: security.redis,
      lockKey: coordinationKeys.lockKey,
      owner: lockOwner,
      ttlSeconds: lockTtlSeconds,
    });

    if (!hasLock) {
      return {
        status: 409,
        body: {
          error: "This donation authorization is already being relayed.",
          status: "pending",
        },
      };
    }

    let shouldReleaseLock = true;

    try {
      const authorizationUsed = (await publicClient.readContract({
        address: usdcAddress,
        abi: usdcAuthorizationAbi,
        functionName: "authorizationState",
        args: [donor, nonce],
      })) as boolean;

      if (authorizationUsed) {
        return badRequest("USDC authorization has already been used or cancelled.");
      }

      const usdcBalance = (await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [donor],
      })) as bigint;

      if (usdcBalance < price) {
        return badRequest("Donor has insufficient USDC balance.");
      }

      const message = {
        from: donor,
        to: contractAddress,
        value: price,
        validAfter,
        validBefore,
        nonce,
      };
      const isValidSignature = await publicClient.verifyTypedData({
        address: donor,
        domain: {
          name: USDC_EIP712_NAME,
          version: USDC_EIP712_VERSION,
          chainId: monadTestnet.id,
          verifyingContract: usdcAddress,
        },
        primaryType: "ReceiveWithAuthorization",
        types: receiveWithAuthorizationTypes,
        message,
        signature,
      });

      if (!isValidSignature) {
        return badRequest("Invalid USDC receive authorization signature.");
      }

      const { v, r, s } = parseSignature(signature);
      const args = [
        donor,
        creator,
        emoteId,
        validAfter,
        validBefore,
        randomSalt,
        Number(v),
        r,
        s,
      ] as const;
      let relayer: PrivateKeyAccount;

      try {
        relayer = privateKeyToAccount(normalizePrivateKey(relayerPrivateKey));
      } catch {
        return serviceUnavailable("EmotePay relayer is not configured.");
      }

      try {
        await publicClient.simulateContract({
          account: relayer,
          address: contractAddress,
          abi: emotePayContract.abi,
          functionName: "donateWithAuthorization",
          args,
        });
      } catch {
        return badRequest("Donation simulation failed.");
      }

      shouldReleaseLock = false;

      try {
        const walletClient = createWalletClient(relayer);
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: emotePayContract.abi,
          functionName: "donateWithAuthorization",
          args,
        });
        const relayResult = {
          status: "submitted",
          hash,
          amount: price.toString(),
          nonce,
          updatedAt: Date.now(),
        } as const;

        try {
          await rememberRelayResult({
            redis: security.redis,
            resultKey: coordinationKeys.resultKey,
            result: relayResult,
          });
        } catch {
          return {
            status: 503,
            body: {
              error:
                "Donation was submitted, but the relayer could not persist its status. Please check the transaction before retrying.",
              status: "unknown",
              nonce,
            },
          };
        }

        shouldReleaseLock = true;

        return {
          status: 200,
          body: {
            hash,
            amount: price.toString(),
            nonce,
          },
        };
      } catch (error) {
        if (isAmbiguousBroadcastError(error)) {
          try {
            await rememberRelayResult({
              redis: security.redis,
              resultKey: coordinationKeys.resultKey,
              result: {
                status: "unknown",
                nonce,
                owner: lockOwner,
                updatedAt: Date.now(),
                reason: "ambiguous-broadcast",
              },
            });
          } catch {
            // Keep the lock. Without a persisted result, allowing an automatic
            // retry could duplicate an ambiguous broadcast.
          }

          return {
            status: 503,
            body: {
              error:
                "Donation relay status is unknown. Please wait before signing a new authorization.",
              status: "unknown",
              nonce,
            },
          };
        }

        shouldReleaseLock = true;

        return badRequest("Relayer could not submit this donation.");
      }
    } finally {
      if (shouldReleaseLock) {
        try {
          await releaseRelayLockIfOwner({
            redis: security.redis,
            lockKey: coordinationKeys.lockKey,
            owner: lockOwner,
          });
        } catch {
          // Failing closed is preferable to deleting a lock unsafely or
          // returning sensitive internal details to the client.
        }
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Redis rate limiting is unavailable."
    ) {
      return serviceUnavailable(error.message);
    }

    if (error instanceof Error && error.message.toLowerCase().includes("redis")) {
      return serviceUnavailable("Redis coordination is unavailable.");
    }

    return badRequest(
      error instanceof Error ? error.message : "Relayer request failed.",
    );
  }
}
