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

export function getEnvioApiUrl() {
  return "/api/envio";
}

export function getCreatorHistoryAddress() {
  return demoCreator.walletAddress?.toLowerCase() || null;
}

export async function fetchCreatorHistory({
  apiUrl,
  creatorAddress,
  limit = 20,
}: {
  apiUrl: string;
  creatorAddress: string;
  limit?: number;
}): Promise<CreatorHistory> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      creatorAddress,
      limit,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(payload?.error || `Envio API returned ${response.status}`);
  }

  return response.json() as Promise<CreatorHistory>;
}
