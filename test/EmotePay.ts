import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther, zeroAddress } from "viem";

describe("EmotePay", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, donor, creator] = await viem.getWalletClients();

  async function deployEmotePay() {
    const emotePay = await viem.deployContract("EmotePay", [], {
      client: { wallet: deployer },
    });

    return { emotePay };
  }

  it("accepts a native donation and emits the canonical Donation event", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);
    const amount = parseEther("1");
    const emoteId = 1n;

    await viem.assertions.emitWithArgs(
      emotePay.write.donate([creator.account.address, emoteId], {
        account: donor.account,
        value: amount,
      }),
      emotePay,
      "Donation",
      [donor.account.address, creator.account.address, amount, emoteId],
    );
  });

  it("forwards the exact native amount to the creator and retains no funds", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);
    const amount = parseEther("2");
    const creatorBalanceBefore = await publicClient.getBalance({
      address: creator.account.address,
    });

    await emotePay.write.donate([creator.account.address, 2n], {
      account: donor.account,
      value: amount,
    });

    const creatorBalanceAfter = await publicClient.getBalance({
      address: creator.account.address,
    });
    const contractBalance = await publicClient.getBalance({
      address: emotePay.address,
    });

    assert.equal(creatorBalanceAfter - creatorBalanceBefore, amount);
    assert.equal(contractBalance, 0n);
  });

  it("reverts zero-value donations", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([creator.account.address, 1n], {
        account: donor.account,
        value: 0n,
      }),
      emotePay,
      "ZeroDonation",
    );
  });

  it("reverts donations to the zero address", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([zeroAddress, 1n], {
        account: donor.account,
        value: parseEther("1"),
      }),
      emotePay,
      "InvalidCreator",
    );
  });

  it("reverts self-donations", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([creator.account.address, 1n], {
        account: creator.account,
        value: parseEther("1"),
      }),
      emotePay,
      "SelfDonationNotAllowed",
    );
  });

  it("reverts when forwarding native value fails", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);
    const rejectingCreator = await viem.deployContract("RevertingReceiver", [], {
      client: { wallet: deployer },
    });

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([rejectingCreator.address, 1n], {
        account: donor.account,
        value: parseEther("1"),
      }),
      emotePay,
      "TransferFailed",
    );
  });
});
