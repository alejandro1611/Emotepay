import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const MONAD_TESTNET_CHAIN_ID = 10143;
const rpcUrl = process.env.MONAD_TESTNET_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!rpcUrl) {
  console.log("RPC configured: no");
  process.exit(0);
}

if (!privateKey) {
  console.log("RPC configured: yes");
  console.log("Deployer configured: no");
  process.exit(0);
}

const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
);
const publicClient = createPublicClient({
  transport: http(rpcUrl),
});

console.log("Network: Monad Testnet");
console.log(`Expected chain id: ${MONAD_TESTNET_CHAIN_ID}`);
console.log("RPC configured: yes");
console.log(`Deployer public address: ${account.address}`);

try {
  const chainId = await publicClient.getChainId();
  console.log(`RPC chain id: ${chainId}`);

  if (chainId !== MONAD_TESTNET_CHAIN_ID) {
    console.log("Deployer balance: not checked because RPC chain id is unexpected");
    process.exit(1);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer balance: ${formatEther(balance)} MON`);
  console.log(`Appears funded: ${balance > 0n ? "yes" : "no"}`);
} catch (error) {
  console.log(
    `Unable to query deployer balance: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exit(1);
}
