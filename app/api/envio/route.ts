import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { isAddress, isAddressEqual } from "viem";

import type {
  EnvioCreatorStats,
  EnvioDonation,
  CreatorHistory,
} from "@/lib/envio";
import { requireCreatorAuthorization } from "@/lib/creator-authorization";
import { demoCreator } from "@/lib/creator";
import {
  getEnvioGraphqlHeaders,
  getEnvioServerConfig,
  type EnvioServerConfig,
} from "@/lib/envio-server-config";

export const dynamic = "force-dynamic";

type CreatorHistoryRequest = {
  creatorAddress?: unknown;
  limit?: unknown;
};

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: Array<{ message?: string }>;
};

type CreatorStatsData = {
  Creator_by_pk?: EnvioCreatorStats | null;
};

type RecentDonationsData = {
  Donation?: EnvioDonation[];
};

function getLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 20;
  }

  return Math.min(Math.max(value, 1), 100);
}

async function readGraphqlQuery(fileName: string) {
  return readFile(join(process.cwd(), "indexer", "graphql", fileName), "utf8");
}

async function fetchEnvioGraphql<TData>({
  query,
  variables,
  graphqlUrl,
  config,
}: {
  query: string;
  variables: Record<string, unknown>;
  graphqlUrl: string;
  config: Extract<EnvioServerConfig, { status: "ready" }>;
}) {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: getEnvioGraphqlHeaders(config),
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Envio GraphQL returned ${response.status}`);
  }

  const payload = (await response.json()) as GraphqlResponse<TData>;

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || "Envio GraphQL query failed.",
    );
  }

  return payload.data;
}

export async function POST(request: Request) {
  const authorization = await requireCreatorAuthorization(request);

  if (authorization.status === "unauthenticated") {
    return NextResponse.json(
      { error: authorization.reason },
      { status: 401 },
    );
  }

  if (authorization.status === "forbidden") {
    return NextResponse.json(
      { error: authorization.reason },
      { status: 403 },
    );
  }

  if (authorization.status === "misconfigured") {
    return NextResponse.json(
      { error: authorization.reason },
      { status: 503 },
    );
  }

  const envioConfig = getEnvioServerConfig();
  if (envioConfig.status !== "ready") {
    return NextResponse.json(
      { error: envioConfig.reason },
      { status: 503 },
    );
  }

  const body = (await request.json()) as CreatorHistoryRequest;
  const creatorAddress =
    typeof body.creatorAddress === "string"
      ? body.creatorAddress.toLowerCase()
      : "";

  if (!isAddress(creatorAddress)) {
    return NextResponse.json(
      { error: "Creator address is invalid." },
      { status: 400 },
    );
  }

  if (
    !demoCreator.walletAddress ||
    !isAddressEqual(creatorAddress, demoCreator.walletAddress)
  ) {
    return NextResponse.json(
      { error: "Creator address is not authorized." },
      { status: 403 },
    );
  }

  try {
    const [creatorStatsQuery, recentDonationsQuery] = await Promise.all([
      readGraphqlQuery("creator-stats.graphql"),
      readGraphqlQuery("recent-donations.graphql"),
    ]);
    const limit = getLimit(body.limit);

    const [creatorStatsData, recentDonationsData] = await Promise.all([
      fetchEnvioGraphql<CreatorStatsData>({
        graphqlUrl: envioConfig.graphqlUrl,
        config: envioConfig,
        query: creatorStatsQuery,
        variables: { creator: demoCreator.walletAddress.toLowerCase() },
      }),
      fetchEnvioGraphql<RecentDonationsData>({
        graphqlUrl: envioConfig.graphqlUrl,
        config: envioConfig,
        query: recentDonationsQuery,
        variables: { creator: demoCreator.walletAddress.toLowerCase(), limit },
      }),
    ]);

    const history: CreatorHistory = {
      stats: creatorStatsData?.Creator_by_pk ?? null,
      donations: recentDonationsData?.Donation ?? [],
    };

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Envio donation history.",
      },
      { status: 502 },
    );
  }
}
