import { getAddress, isAddress, type Address } from "viem";
import { emotePayAbi } from "@/lib/generated/emotePayAbi";

export type ContractConfigurationStatus =
  | "ready"
  | "missing-address"
  | "invalid-address";

export type EmotePayContractConfig = {
  address: Address | null;
  abi: typeof emotePayAbi;
  configurationStatus: ContractConfigurationStatus;
};

function getContractAddress(): Pick<
  EmotePayContractConfig,
  "address" | "configurationStatus"
> {
  const configuredAddress =
    process.env.NEXT_PUBLIC_EMOTEPAY_CONTRACT_ADDRESS?.trim();

  if (!configuredAddress) {
    return {
      address: null,
      configurationStatus: "missing-address",
    };
  }

  if (!isAddress(configuredAddress)) {
    return {
      address: null,
      configurationStatus: "invalid-address",
    };
  }

  return {
    address: getAddress(configuredAddress),
    configurationStatus: "ready",
  };
}

export const emotePayContract: EmotePayContractConfig = {
  abi: emotePayAbi,
  ...getContractAddress(),
};

export { emotePayAbi };
