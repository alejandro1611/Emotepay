import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { monadTestnet } from "../lib/chains";
import { getPrivyEmbeddedEvmWallet } from "../lib/embedded-wallet";
import {
  formatTokenAmount,
  getPaymentBalanceCheckState,
  isBalanceReadyForEmote,
  shouldApplyBalanceResponse,
  type PaymentBalanceCheckState,
} from "../lib/payment-balance";

describe("payment balance state", function () {
  const walletAddress = "0x0000000000000000000000000000000000000001";
  const nextWalletAddress = "0x0000000000000000000000000000000000000002";
  const usdcAddress = "0x0000000000000000000000000000000000000003";

  it("represents initial loading without a fake zero balance", function () {
    const balanceCheck: PaymentBalanceCheckState = {
      status: "checking",
      walletAddress,
      checkedOnchainId: 1,
    };

    assert.equal(isBalanceReadyForEmote(balanceCheck, walletAddress, 1), false);
    assert.equal("usdcBalance" in balanceCheck, false);
  });

  it("blocks a zero USDC balance", function () {
    const balanceCheck = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 0n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });

    assert.equal(balanceCheck.status, "insufficient");
    assert.equal(isBalanceReadyForEmote(balanceCheck, walletAddress, 1), false);
  });

  it("allows a wallet with enough USDC for the selected reaction", function () {
    const balanceCheck = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 100_000n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });

    assert.equal(balanceCheck.status, "ready");
    assert.equal(balanceCheck.usdcBalance, 100_000n);
    assert.equal(isBalanceReadyForEmote(balanceCheck, walletAddress, 1), true);
  });

  it("keeps the frontend payment network pinned to Monad Testnet", function () {
    assert.equal(monadTestnet.id, 10143);
    assert.equal(monadTestnet.testnet, true);
  });

  it("selects the Privy embedded EVM wallet instead of another logged-in wallet", function () {
    const wallet = getPrivyEmbeddedEvmWallet([
      {
        address: "0x0000000000000000000000000000000000000004",
        type: "ethereum",
        walletClientType: "metamask",
      },
      {
        address: "0x0000000000000000000000000000000000000005",
        type: "solana",
        walletClientType: "privy",
      },
      {
        address: walletAddress,
        type: "ethereum",
        walletClientType: "privy",
      },
    ]);

    assert.equal(wallet?.address, walletAddress);
  });

  it("rejects stale balance responses after wallet switching", function () {
    assert.equal(
      shouldApplyBalanceResponse({
        currentRequestId: 2,
        responseRequestId: 1,
        currentWalletAddress: nextWalletAddress,
        responseWalletAddress: walletAddress,
      }),
      false,
    );
    assert.equal(
      shouldApplyBalanceResponse({
        currentRequestId: 2,
        responseRequestId: 2,
        currentWalletAddress: nextWalletAddress,
        responseWalletAddress: nextWalletAddress,
      }),
      true,
    );
  });

  it("updates to the real funded balance after a refresh", function () {
    const beforeFunding = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 0n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });
    const afterFunding = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 20_000_000n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });

    assert.equal(beforeFunding.status, "insufficient");
    assert.equal(afterFunding.status, "ready");
    assert.equal(formatTokenAmount({
      amount: afterFunding.usdcBalance,
      decimals: afterFunding.usdcDecimals,
    }), "20.00");
  });

  it("reflects successful donations only after a refetched on-chain balance", function () {
    const beforeDonation = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 20_000_000n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });
    const afterConfirmedDonation = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 19_900_000n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });

    assert.equal(beforeDonation.status, "ready");
    assert.equal(afterConfirmedDonation.status, "ready");
    assert.equal(formatTokenAmount({
      amount: afterConfirmedDonation.usdcBalance,
      decimals: afterConfirmedDonation.usdcDecimals,
    }), "19.90");
  });

  it("does not assume a failed transaction deducted funds", function () {
    const currentBalance = getPaymentBalanceCheckState({
      walletAddress,
      usdcAddress,
      usdcBalance: 20_000_000n,
      usdcDecimals: 6,
      contractPrice: 100_000n,
      checkedOnchainId: 1,
    });

    assert.equal(currentBalance.status, "ready");
    assert.equal(currentBalance.usdcBalance, 20_000_000n);
  });
});
