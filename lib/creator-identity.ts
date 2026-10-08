import { getAddress, isAddress, isAddressEqual, type Address } from "viem";

type LinkedAccountLike = {
  type?: unknown;
  address?: unknown;
  chain_type?: unknown;
};

type PrivyUserLike = {
  linked_accounts?: unknown;
  linkedAccounts?: unknown;
};

function getLinkedAccounts(user: unknown): LinkedAccountLike[] {
  if (!user || typeof user !== "object") {
    return [];
  }

  const candidate = user as PrivyUserLike;
  const linkedAccounts = candidate.linked_accounts ?? candidate.linkedAccounts;

  if (!Array.isArray(linkedAccounts)) {
    return [];
  }

  return linkedAccounts.filter(
    (account): account is LinkedAccountLike =>
      Boolean(account) && typeof account === "object",
  );
}

export function getPrivyUserEthereumWalletAddresses(user: unknown): Address[] {
  return getLinkedAccounts(user).flatMap((account) => {
    const isWallet =
      account.type === "wallet" || account.type === "smart_wallet";
    const isEthereumWallet =
      account.chain_type === undefined || account.chain_type === "ethereum";

    if (!isWallet || !isEthereumWallet || typeof account.address !== "string") {
      return [];
    }

    if (!isAddress(account.address)) {
      return [];
    }

    return [getAddress(account.address)];
  });
}

export function isCreatorPrivyUser(
  user: unknown,
  creatorAddress: string | null | undefined,
) {
  if (!creatorAddress || !isAddress(creatorAddress)) {
    return false;
  }

  const normalizedCreatorAddress = getAddress(creatorAddress);

  return getPrivyUserEthereumWalletAddresses(user).some((walletAddress) =>
    isAddressEqual(walletAddress, normalizedCreatorAddress),
  );
}
