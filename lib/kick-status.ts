export const KICK_STATUS_CACHE_TTL_MS = 30_000;
export const KICK_STATUS_SHARED_CACHE_SECONDS = 30;
export const KICK_STATUS_STALE_WHILE_REVALIDATE_SECONDS = 60;

const KICK_API_BASE_URL = "https://api.kick.com";
const KICK_OAUTH_TOKEN_URL = "https://id.kick.com/oauth/token";

export type KickStreamStatus = "live" | "offline" | "unknown";

export type KickStatusResponse = {
  status: KickStreamStatus;
  channel: string | null;
  checkedAt: string;
  cached: boolean;
  stale: boolean;
  title?: string;
  viewerCount?: number;
  startedAt?: string;
  error?: string;
};

type KickStatusEnvironment = Record<string, string | undefined> & {
  NEXT_PUBLIC_KICK_CHANNEL?: string;
  KICK_API_ACCESS_TOKEN?: string;
  KICK_CLIENT_ID?: string;
  KICK_CLIENT_SECRET?: string;
};

type KickChannelStream = {
  is_live?: unknown;
  viewer_count?: unknown;
  start_time?: unknown;
};

type KickChannel = {
  slug?: unknown;
  stream?: KickChannelStream | null;
  stream_title?: unknown;
};

type KickChannelResponse = {
  data?: unknown;
};

type KickTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

type CachedStatus = {
  channel: string;
  expiresAt: number;
  response: Omit<KickStatusResponse, "cached">;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

export type KickStatusDependencies = {
  environment?: KickStatusEnvironment;
  fetch?: typeof fetch;
  now?: () => number;
};

let statusCache: CachedStatus | null = null;
let tokenCache: CachedToken | null = null;

export function resetKickStatusCachesForTests() {
  statusCache = null;
  tokenCache = null;
}

export function getKickChannelSlug(environment: KickStatusEnvironment = process.env) {
  const channel = environment.NEXT_PUBLIC_KICK_CHANNEL?.trim().replace(/^@/, "");

  return channel || null;
}

function getUnknownStatus({
  channel,
  checkedAt,
  error,
}: {
  channel: string | null;
  checkedAt: string;
  error: string;
}): Omit<KickStatusResponse, "cached"> {
  return {
    status: "unknown",
    channel,
    checkedAt,
    stale: false,
    error,
  };
}

function getAccessTokenFromEnvironment(environment: KickStatusEnvironment) {
  return environment.KICK_API_ACCESS_TOKEN?.trim() || null;
}

async function getKickAccessToken({
  environment,
  fetchImplementation,
  now,
}: {
  environment: KickStatusEnvironment;
  fetchImplementation: typeof fetch;
  now: number;
}) {
  const configuredToken = getAccessTokenFromEnvironment(environment);

  if (configuredToken) {
    return configuredToken;
  }

  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = environment.KICK_CLIENT_ID?.trim();
  const clientSecret = environment.KICK_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchImplementation(KICK_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Kick token request failed.");
  }

  const tokenResponse = (await response.json()) as KickTokenResponse;
  const accessToken =
    typeof tokenResponse.access_token === "string"
      ? tokenResponse.access_token
      : null;

  if (!accessToken) {
    throw new Error("Kick token response did not include an access token.");
  }

  const expiresInSeconds =
    typeof tokenResponse.expires_in === "number"
      ? tokenResponse.expires_in
      : Number(tokenResponse.expires_in);
  const safeExpiresInSeconds =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 120
      ? expiresInSeconds
      : 300;

  tokenCache = {
    accessToken,
    expiresAt: now + Math.max(60, safeExpiresInSeconds - 60) * 1_000,
  };

  return accessToken;
}

function getFirstChannel(value: unknown): KickChannel | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const [firstChannel] = value;

  return firstChannel && typeof firstChannel === "object"
    ? (firstChannel as KickChannel)
    : null;
}

function parseKickChannelStatus({
  channel,
  checkedAt,
  payload,
}: {
  channel: string;
  checkedAt: string;
  payload: KickChannelResponse;
}): Omit<KickStatusResponse, "cached"> {
  const kickChannel = getFirstChannel(payload.data);

  if (!kickChannel) {
    return getUnknownStatus({
      channel,
      checkedAt,
      error: "Kick channel was not found.",
    });
  }

  const stream = kickChannel.stream;
  const isLive = stream?.is_live === true;
  const viewerCount = stream?.viewer_count;
  const startTime = stream?.start_time;
  const streamTitle = kickChannel.stream_title;

  return {
    status: isLive ? "live" : "offline",
    channel:
      typeof kickChannel.slug === "string" && kickChannel.slug
        ? kickChannel.slug
        : channel,
    checkedAt,
    stale: false,
    ...(typeof streamTitle === "string" && streamTitle
      ? { title: streamTitle }
      : {}),
    ...(isLive && typeof viewerCount === "number"
      ? { viewerCount }
      : {}),
    ...(isLive && typeof startTime === "string" && startTime
      ? { startedAt: startTime }
      : {}),
  };
}

export async function getKickStatus({
  environment = process.env,
  fetch: fetchImplementation = fetch,
  now: getNow = Date.now,
}: KickStatusDependencies = {}): Promise<KickStatusResponse> {
  const channel = getKickChannelSlug(environment);
  const now = getNow();
  const checkedAt = new Date(now).toISOString();

  if (!channel) {
    return {
      ...getUnknownStatus({
        channel: null,
        checkedAt,
        error: "Kick channel is not configured.",
      }),
      cached: false,
    };
  }

  if (
    statusCache &&
    statusCache.channel === channel &&
    statusCache.expiresAt > now
  ) {
    return {
      ...statusCache.response,
      cached: true,
    };
  }

  try {
    const accessToken = await getKickAccessToken({
      environment,
      fetchImplementation,
      now,
    });

    if (!accessToken) {
      return {
        ...getUnknownStatus({
          channel,
          checkedAt,
          error: "Kick API credentials are not configured.",
        }),
        cached: false,
      };
    }

    const response = await fetchImplementation(
      `${KICK_API_BASE_URL}/public/v1/channels?slug=${encodeURIComponent(channel)}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error("Kick channel request failed.");
    }

    const status = parseKickChannelStatus({
      channel,
      checkedAt,
      payload: (await response.json()) as KickChannelResponse,
    });

    statusCache = {
      channel,
      expiresAt: now + KICK_STATUS_CACHE_TTL_MS,
      response: status,
    };

    return {
      ...status,
      cached: false,
    };
  } catch {
    if (statusCache?.channel === channel) {
      return {
        ...statusCache.response,
        checkedAt,
        cached: true,
        stale: true,
        error: "Kick status is temporarily unavailable.",
      };
    }

    return {
      ...getUnknownStatus({
        channel,
        checkedAt,
        error: "Kick status is temporarily unavailable.",
      }),
      cached: false,
    };
  }
}
