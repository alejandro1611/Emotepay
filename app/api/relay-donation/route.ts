import { NextResponse, type NextRequest } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chains";
import { emotePayContract } from "@/lib/contracts";
import {
  getAuthorizationWindowError,
  getRelayAuthorizationKey,
  MAX_RELAY_REQUEST_BYTES,
  RelayedAuthorizationMemory,
} from "@/lib/relay-donation-preflight";
import {
  receiveWithAuthorizationTypes,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
} from "@/lib/usdc-authorization";

const rpcUrl =
  process.env.MONAD_TESTNET_RPC_URL ?? monadTestnet.rpcUrls.default.http[0];
const configuredContractAddress =
  process.env.NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS?.trim();

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

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(rpcUrl),
});

const relayedAuthorizationMemory = new RelayedAuthorizationMemory();

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
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

function parseUint(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be an unsigned integer string.`);
  }

  return BigInt(value);
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    const contentLength = request.headers.get("content-length");

    if (contentLength && Number(contentLength) > MAX_RELAY_REQUEST_BYTES) {
      return badRequest("Relayer request body is too large.");
    }

    body = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Request body must be an object.");
  }

  const payload = body as Record<string, unknown>;

  try {
    const relayerPrivateKey = process.env.EMOTEPAY_RELAYER_PRIVATE_KEY;

    if (!relayerPrivateKey) {
      return NextResponse.json(
        { error: "EmotePay relayer is not configured." },
        { status: 503 },
      );
    }

    if (!configuredContractAddress) {
      return NextResponse.json(
        { error: "EmotePay V3 contract address is not configured." },
        { status: 503 },
      );
    }

    const contractAddress = parseAddress(payload.contractAddress, "contractAddress");
    const donor = parseAddress(payload.donor, "donor");
    const creator = parseAddress(payload.creator, "creator");
    const usdcAddress = parseAddress(payload.usdcAddress, "usdcAddress");
    const randomSalt = parseHex(payload.randomSalt, "randomSalt");
    const signature = parseHex(payload.signature, "signature");
    const emoteId = parseUint(payload.emoteId, "emoteId");
    const validAfter = parseUint(payload.validAfter, "validAfter");
    const validBefore = parseUint(payload.validBefore, "validBefore");

    if (!isAddressEqual(contractAddress, getAddress(configuredContractAddress))) {
      return badRequest("Unexpected EmotePay contract address.");
    }

    requireHexLength(randomSalt, "randomSalt", 66);
    requireHexLength(signature, "signature", 132);

    const [chainId, configuredUsdcAddress, price] = await Promise.all([
      publicClient.getChainId(),
      publicClient.readContract({
        address: contractAddress,
        abi: emotePayContract.abi,
        functionName: "usdc",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: emotePayContract.abi,
        functionName: "getEmotePrice",
        args: [emoteId],
      }),
    ]);

    if (chainId !== monadTestnet.id) {
      return NextResponse.json(
        { error: "Configured RPC is not Monad Testnet." },
        { status: 503 },
      );
    }

    if (!isAddressEqual(usdcAddress, configuredUsdcAddress)) {
      return badRequest("Unexpected USDC token address.");
    }

    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const windowError = getAuthorizationWindowError({
      currentTime,
      validAfter,
      validBefore,
    });

    if (windowError) {
      return badRequest(windowError);
    }

    const nonce = await publicClient.readContract({
      address: contractAddress,
      abi: emotePayContract.abi,
      functionName: "computeDonationAuthorizationNonce",
      args: [donor, creator, emoteId, price, randomSalt],
    });
    const relayKey = getRelayAuthorizationKey(donor, nonce);
    const existingRelay = relayedAuthorizationMemory.getRelayed(relayKey);

    if (existingRelay) {
      return NextResponse.json(existingRelay);
    }

    let authorizationUsed: boolean;

    try {
      authorizationUsed = await publicClient.readContract({
        address: usdcAddress,
        abi: usdcAuthorizationAbi,
        functionName: "authorizationState",
        args: [donor, nonce],
      });
    } catch {
      return NextResponse.json(
        { error: "Could not verify USDC authorization state." },
        { status: 503 },
      );
    }

    if (authorizationUsed) {
      return badRequest("USDC authorization has already been used or cancelled.");
    }

    if (!relayedAuthorizationMemory.lock(relayKey)) {
      return NextResponse.json(
        { error: "This donation authorization is already being relayed." },
        { status: 409 },
      );
    }

    try {
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
      const relayer = privateKeyToAccount(relayerPrivateKey as Hex);
      const walletClient = createWalletClient({
        account: relayer,
        chain: monadTestnet,
        transport: http(rpcUrl),
      });
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: emotePayContract.abi,
        functionName: "donateWithAuthorization",
        args: [
          donor,
          creator,
          emoteId,
          validAfter,
          validBefore,
          randomSalt,
          Number(v),
          r,
          s,
        ],
      });
      const relayResult = {
        hash,
        amount: price.toString(),
        nonce,
      };

      // MVP single-process dedupe: prevents same donor+nonce from being
      // broadcast twice by this server instance. Multi-instance deployments
      // should replace this with shared storage or a queue.
      relayedAuthorizationMemory.remember(relayKey, relayResult);

      return NextResponse.json(relayResult);
    } finally {
      relayedAuthorizationMemory.unlock(relayKey);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Relayer request failed.";

    return badRequest(reason);
  }
}
