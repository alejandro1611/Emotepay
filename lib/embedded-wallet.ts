export type EmbeddedWalletCandidate = {
  address?: string;
  type?: string;
  walletClientType?: string;
};

export function isPrivyEmbeddedEvmWallet(wallet: EmbeddedWalletCandidate) {
  return (
    wallet.type === "ethereum" &&
    (wallet.walletClientType === "privy" ||
      wallet.walletClientType === "privy-v2") &&
    typeof wallet.address === "string" &&
    wallet.address.length > 0
  );
}

export function getPrivyEmbeddedEvmWallet<TWallet extends EmbeddedWalletCandidate>(
  wallets: readonly TWallet[],
) {
  return wallets.find(isPrivyEmbeddedEvmWallet);
}
