import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chains";
import {
  handleRelayDonationRequest,
  type RelayDonationHandlerResponse,
} from "@/lib/relay-donation-handler";
import { MAX_RELAY_REQUEST_BYTES } from "@/lib/relay-donation-preflight";
import {
  createRelaySecurityFromEnv,
  getTrustedClientIdentifier,
} from "@/lib/relay-donation-security";

export const runtime = "nodejs";
export const maxDuration = 20;

const rpcUrl =
  process.env.MONAD_TESTNET_RPC_URL ?? monadTestnet.rpcUrls.default.http[0];

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(rpcUrl),
});

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
}

function toNextResponse({ body, status }: RelayDonationHandlerResponse) {
  return NextResponse.json(body, { status });
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

  let security;

  try {
    security = createRelaySecurityFromEnv();
  } catch {
    return NextResponse.json(
      { error: "EmotePay relayer security is not configured." },
      { status: 503 },
    );
  }

  const clientIdentifier = getTrustedClientIdentifier({
    headers: request.headers,
    isVercel: process.env.VERCEL === "1",
  });

  const response = await handleRelayDonationRequest(
    body as Record<string, unknown>,
    {
      publicClient,
      createWalletClient: (account: PrivateKeyAccount) =>
        createWalletClient({
          account,
          chain: monadTestnet,
          transport: http(rpcUrl),
        }),
      security,
      clientIdentifier,
    },
  );

  return toNextResponse(response);
}
