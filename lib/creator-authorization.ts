import "server-only";

import { PrivyClient } from "@privy-io/node";

import { demoCreator } from "@/lib/creator";
import { isCreatorPrivyUser } from "@/lib/creator-identity";

type AuthorizationResult =
  | { status: "authorized" }
  | { status: "unauthenticated"; reason: string }
  | { status: "forbidden"; reason: string }
  | { status: "misconfigured"; reason: string };

type PrivyServerConfig = {
  appId: string;
  appSecret: string;
};

let cachedClient:
  | {
      key: string;
      client: PrivyClient;
    }
  | null = null;

function getPrivyServerConfig(): PrivyServerConfig | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    return null;
  }

  return { appId, appSecret };
}

function getPrivyClient({ appId, appSecret }: PrivyServerConfig) {
  const key = `${appId}:${appSecret}`;

  if (cachedClient?.key === key) {
    return cachedClient.client;
  }

  const client = new PrivyClient({ appId, appSecret });
  cachedClient = { key, client };

  return client;
}

export function getBearerAccessToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

export async function requireCreatorAuthorization(
  request: Request,
): Promise<AuthorizationResult> {
  const accessToken = getBearerAccessToken(
    request.headers.get("authorization"),
  );

  if (!accessToken) {
    return {
      status: "unauthenticated",
      reason: "Privy access token is required.",
    };
  }

  if (!demoCreator.walletAddress) {
    return {
      status: "misconfigured",
      reason: "Creator wallet address is not configured.",
    };
  }

  const privyConfig = getPrivyServerConfig();

  if (!privyConfig) {
    return {
      status: "misconfigured",
      reason: "Privy server authentication is not configured.",
    };
  }

  try {
    const privy = getPrivyClient(privyConfig);
    const tokenPayload = await privy.utils().auth().verifyAccessToken(accessToken);
    const user = await privy.users()._get(tokenPayload.user_id);

    if (!isCreatorPrivyUser(user, demoCreator.walletAddress)) {
      return {
        status: "forbidden",
        reason: "Authenticated user is not the configured creator.",
      };
    }

    return { status: "authorized" };
  } catch {
    return {
      status: "unauthenticated",
      reason: "Privy access token is invalid or expired.",
    };
  }
}
