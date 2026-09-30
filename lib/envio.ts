import { demoCreator } from "@/lib/creator";

export type EnvioDonation = {
  id: string;
  donor: string;
  creator: string;
  amount: string;
  emoteId: string;
  transactionHash: string;
  blockNumber: string;
  logIndex: number;
  timestamp: string;
};

export type EnvioCreatorStats = {
  id: string;
  totalDonationsCount: number;
  totalAmountReceived: string;
  uniqueDonorsCount: number;
};

export type CreatorHistory = {
  stats: EnvioCreatorStats | null;
  donations: EnvioDonation[];
};

const creatorHistoryQuery = `
  query CreatorHistory($creator: String!, $creatorId: ID!, $limit: Int = 20) {
    Creator_by_pk(id: $creatorId) {
      id
      totalDonationsCount
      totalAmountReceived
      uniqueDonorsCount
    }
    Donation(
      where: { creator: { _eq: $creator } }
      order_by: [{ blockNumber: desc }, { logIndex: desc }]
      limit: $limit
    ) {
      id
      donor
      creator
      amount
      emoteId
      transactionHash
      blockNumber
      logIndex
      timestamp
    }
  }
`;

export function getEnvioGraphqlUrl() {
  return process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL?.trim() || null;
}

export function getCreatorHistoryAddress() {
  return demoCreator.walletAddress?.toLowerCase() || null;
}

export async function fetchCreatorHistory({
  graphqlUrl,
  creatorAddress,
  limit = 20,
}: {
  graphqlUrl: string;
  creatorAddress: string;
  limit?: number;
}): Promise<CreatorHistory> {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: creatorHistoryQuery,
      variables: {
        creator: creatorAddress,
        creatorId: creatorAddress,
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Envio GraphQL returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      Creator_by_pk?: EnvioCreatorStats | null;
      Donation?: EnvioDonation[];
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || "Envio GraphQL query failed.",
    );
  }

  return {
    stats: payload.data?.Creator_by_pk ?? null,
    donations: payload.data?.Donation ?? [],
  };
}
