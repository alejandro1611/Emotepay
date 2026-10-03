import { network } from "hardhat";

const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_TESTNET_USDC_ADDRESS =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3";

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

console.log("Deploying EmotePay V2 (USDC) to Monad Testnet");
console.log(`Chain id: ${chainId}`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`USDC token: ${MONAD_TESTNET_USDC_ADDRESS}`);

const { contract, deploymentTransaction } =
  await viem.sendDeploymentTransaction("EmotePay", [MONAD_TESTNET_USDC_ADDRESS], {
    client: { wallet: deployer },
  });

console.log(`Deployment transaction: ${deploymentTransaction.hash}`);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction.hash,
});

if (receipt.status !== "success") {
  throw new Error("EmotePay deployment transaction reverted");
}

console.log(`EmotePay V2 deployed at: ${contract.address}`);
console.log(`Confirmed in block: ${receipt.blockNumber}`);
