type EnvioEnvironment = Record<string, string | undefined> & {
  ENVIO_GRAPHQL_URL?: string;
  ENVIO_GRAPHQL_ADMIN_SECRET?: string;
};

export type EnvioServerConfig =
  | {
      status: "ready";
      graphqlUrl: string;
      adminSecret: string;
      authMode: "admin-secret";
    }
  | {
      status: "ready";
      graphqlUrl: string;
      authMode: "public";
    }
  | {
      status: "missing";
      reason: string;
    };

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local") &&
      !isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

export function getEnvioServerConfig(
  environment: EnvioEnvironment = process.env,
): EnvioServerConfig {
  const graphqlUrl = environment.ENVIO_GRAPHQL_URL?.trim();
  const adminSecret = environment.ENVIO_GRAPHQL_ADMIN_SECRET?.trim();

  if (!graphqlUrl) {
    return {
      status: "missing",
      reason: "Envio GraphQL URL is missing.",
    };
  }

  if (adminSecret) {
    return {
      status: "ready",
      graphqlUrl,
      adminSecret,
      authMode: "admin-secret",
    };
  }

  if (isPublicHttpsUrl(graphqlUrl)) {
    return {
      status: "ready",
      graphqlUrl,
      authMode: "public",
    };
  }

  return {
    status: "missing",
    reason:
      "Envio GraphQL admin secret is required unless the endpoint is public HTTPS.",
  };
}

export function getEnvioGraphqlHeaders(
  config: Extract<EnvioServerConfig, { status: "ready" }>,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.authMode === "admin-secret") {
    headers["x-hasura-admin-secret"] = config.adminSecret;
  }

  return headers;
}
