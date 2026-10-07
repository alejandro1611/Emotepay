import { type Address, type Hex } from "viem";

export const USDC_EIP712_NAME = "USDC";
export const USDC_EIP712_VERSION = "2";
export const RECEIVE_AUTHORIZATION_VALIDITY_SECONDS = 5 * 60;

export const receiveWithAuthorizationTypes: {
  ReceiveWithAuthorization: { name: string; type: string }[];
} = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export type ReceiveAuthorizationMessage = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export type ReceiveAuthorizationSigningMessage = Omit<
  ReceiveAuthorizationMessage,
  "value" | "validAfter" | "validBefore"
> & {
  value: string;
  validAfter: string;
  validBefore: string;
};

export type RelayDonationRequestPayload = {
  contractAddress: Address;
  usdcAddress: Address;
  donor: Address;
  creator: Address;
  emoteId: string;
  validAfter: string;
  validBefore: string;
  randomSalt: Hex;
  signature: Hex;
};

export function createReceiveAuthorizationValidity(nowSeconds: number) {
  return {
    validAfter: BigInt(Math.max(0, nowSeconds - 30)),
    validBefore: BigInt(nowSeconds + RECEIVE_AUTHORIZATION_VALIDITY_SECONDS),
  };
}

export function createReceiveAuthorizationSigningMessage({
  value,
  validAfter,
  validBefore,
  ...message
}: ReceiveAuthorizationMessage): ReceiveAuthorizationSigningMessage {
  return {
    ...message,
    value: value.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
  };
}

export function createRelayDonationRequestPayload({
  emoteId,
  validAfter,
  validBefore,
  ...payload
}: Omit<RelayDonationRequestPayload, "emoteId" | "validAfter" | "validBefore"> & {
  emoteId: bigint | number;
  validAfter: bigint;
  validBefore: bigint;
}): RelayDonationRequestPayload {
  return {
    ...payload,
    emoteId: emoteId.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
  };
}
