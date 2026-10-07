import { network } from "hardhat";
import { encodeDeployData, type Hex, type PublicClient } from "viem";
import emotePayArtifact from "../artifacts/contracts/EmotePay.sol/EmotePay.json" with {
  type: "json",
};

const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_TESTNET_USDC_ADDRESS =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const RECEIPT_TIMEOUT_MS = 120_000;
const RECEIPT_POLL_INTERVAL_MS = 2_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploymentReceipt({
  hash,
  publicClient,
}: {
  hash: Hex;
  publicClient: PublicClient;
}) {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      return await publicClient.getTransactionReceipt({ hash });
    } catch {
      await wait(RECEIPT_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Deployment transaction ${hash} was not indexed within ${RECEIPT_TIMEOUT_MS}ms. Check the transaction status before retrying; do not blindly rebroadcast.`,
  );
}

const { viem } = await network.create({
  network: "monadTestnet",
  chainType: "l1",
});
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();

if (chainId !== MONAD_TESTNET_CHAIN_ID) {
  throw new Error(
    `Refusing to deploy: expected Monad Testnet chain id ${MONAD_TESTNET_CHAIN_ID}, got ${chainId}`,
  );
}

const [deployer] = await viem.getWalletClients();

console.log("Deploying EmotePay V3 (USDC receive authorization) to Monad Testnet");
console.log(`Chain id: ${chainId}`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`USDC token: ${MONAD_TESTNET_USDC_ADDRESS}`);

const data = encodeDeployData({
  abi: emotePayArtifact.abi,
  bytecode: emotePayArtifact.bytecode as Hex,
  args: [MONAD_TESTNET_USDC_ADDRESS],
});

const hash = await deployer.sendTransaction({
  account: deployer.account,
  data,
});

console.log(`Deployment transaction: ${hash}`);

const receipt = await waitForDeploymentReceipt({
  hash,
  publicClient,
});

if (receipt.status !== "success") {
  throw new Error("EmotePay deployment transaction reverted");
}

if (!receipt.contractAddress) {
  throw new Error("EmotePay deployment receipt did not include a contract address");
}

console.log(`EmotePay V3 deployed at: ${receipt.contractAddress}`);
console.log(`Confirmed in block: ${receipt.blockNumber}`);
