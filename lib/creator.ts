import { getAddress, isAddress, type Address } from "viem";

export type CreatorConfigurationStatus =
  | "ready"
  | "missing-wallet"
  | "invalid-wallet";

export type CreatorConfig = {
  id: string;
  displayName: string;
  walletAddress: Address | null;
  configurationStatus: CreatorConfigurationStatus;
};

function getCreatorWalletAddress(): Pick<
  CreatorConfig,
  "walletAddress" | "configurationStatus"
> {
  const configuredAddress = process.env.NEXT_PUBLIC_CREATOR_WALLET_ADDRESS?.trim();

  if (!configuredAddress) {
    return {
      walletAddress: null,
      configurationStatus: "missing-wallet",
    };
  }

  if (!isAddress(configuredAddress)) {
    return {
      walletAddress: null,
      configurationStatus: "invalid-wallet",
    };
  }

  return {
    walletAddress: getAddress(configuredAddress),
    configurationStatus: "ready",
  };
}

export const demoCreator: CreatorConfig = {
  id: "demo-creator",
  displayName: "Demo Creator",
  ...getCreatorWalletAddress(),
};
