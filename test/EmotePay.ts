import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData, getAddress, zeroAddress } from "viem";

describe("EmotePay", async function () {
  const { viem, networkHelpers } = await network.create();
  const [deployer, donor, creator] = await viem.getWalletClients();

  const prices = [
    { emoteId: 1n, amount: 100_000n },
    { emoteId: 2n, amount: 500_000n },
    { emoteId: 3n, amount: 1_000_000n },
    { emoteId: 4n, amount: 2_500_000n },
  ] as const;

  async function deployEmotePay() {
    const usdc = await viem.deployContract("MockUSDC", [], {
      client: { wallet: deployer },
    });
    const emotePay = await viem.deployContract("EmotePay", [usdc.address], {
      client: { wallet: deployer },
    });

    return { emotePay, usdc };
  }

  async function fundAndApprove({
    amount,
    approval = amount,
  }: {
    amount: bigint;
    approval?: bigint;
  }) {
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);

    await usdc.write.mint([donor.account.address, amount], {
      account: deployer.account,
    });
    await usdc.write.approve([emotePay.address, approval], {
      account: donor.account,
    });

    return { emotePay, usdc };
  }

  it("stores the configured USDC token address", async function () {
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);

    assert.equal(getAddress(await emotePay.read.usdc()), getAddress(usdc.address));
  });

  it("rejects a zero USDC token address at deployment", async function () {
    await assert.rejects(
      viem.deployContract("EmotePay", [zeroAddress], {
        client: { wallet: deployer },
      }),
      /InvalidPaymentToken/,
    );
  });

  it("exposes the approved USDC prices for all supported emotes", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);

    for (const { emoteId, amount } of prices) {
      assert.equal(await emotePay.read.getEmotePrice([emoteId]), amount);
    }
  });

  it("reverts price reads for invalid emote IDs", async function () {
    const { emotePay } = await networkHelpers.loadFixture(deployEmotePay);

    await viem.assertions.revertWithCustomError(
      emotePay.read.getEmotePrice([5n]),
      emotePay,
      "InvalidEmote",
    );
  });

  it("transfers the exact USDC price and emits the canonical Donation event for each emote", async function () {
    for (const { emoteId, amount } of prices) {
      const { emotePay, usdc } = await fundAndApprove({ amount });

      await viem.assertions.emitWithArgs(
        emotePay.write.donate([creator.account.address, emoteId], {
          account: donor.account,
        }),
        emotePay,
        "Donation",
        [donor.account.address, creator.account.address, amount, emoteId],
      );

      assert.equal(await usdc.read.balanceOf([donor.account.address]), 0n);
      assert.equal(
        await usdc.read.balanceOf([creator.account.address]),
        amount,
      );
      assert.equal(await usdc.read.balanceOf([emotePay.address]), 0n);
    }
  });

  it("reverts donations to the zero address", async function () {
    const { emotePay } = await fundAndApprove({ amount: prices[0].amount });

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([zeroAddress, prices[0].emoteId], {
        account: donor.account,
      }),
      emotePay,
      "InvalidCreator",
    );
  });

  it("reverts self-donations", async function () {
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);

    await usdc.write.mint([creator.account.address, prices[0].amount], {
      account: deployer.account,
    });
    await usdc.write.approve([emotePay.address, prices[0].amount], {
      account: creator.account,
    });

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([creator.account.address, prices[0].emoteId], {
        account: creator.account,
      }),
      emotePay,
      "SelfDonationNotAllowed",
    );
  });

  it("reverts invalid emote IDs before moving USDC", async function () {
    const { emotePay, usdc } = await fundAndApprove({
      amount: prices[0].amount,
    });

    await viem.assertions.revertWithCustomError(
      emotePay.write.donate([creator.account.address, 0n], {
        account: donor.account,
      }),
      emotePay,
      "InvalidEmote",
    );

    assert.equal(
      await usdc.read.balanceOf([donor.account.address]),
      prices[0].amount,
    );
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 0n);
  });

  it("reverts when allowance is insufficient", async function () {
    const { emotePay } = await fundAndApprove({
      amount: prices[0].amount,
      approval: prices[0].amount - 1n,
    });

    await assert.rejects(
      emotePay.write.donate([creator.account.address, prices[0].emoteId], {
        account: donor.account,
      }),
    );
  });

  it("reverts when USDC balance is insufficient", async function () {
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);

    await usdc.write.mint([donor.account.address, prices[0].amount - 1n], {
      account: deployer.account,
    });
    await usdc.write.approve([emotePay.address, prices[0].amount], {
      account: donor.account,
    });

    await assert.rejects(
      emotePay.write.donate([creator.account.address, prices[0].emoteId], {
        account: donor.account,
      }),
    );
  });

  it("does not let callers choose a cheaper amount", async function () {
    const { emotePay, usdc } = await fundAndApprove({
      amount: prices[3].amount,
      approval: prices[3].amount,
    });

    await emotePay.write.donate([creator.account.address, prices[3].emoteId], {
      account: donor.account,
    });

    assert.equal(
      await usdc.read.balanceOf([creator.account.address]),
      prices[3].amount,
    );
  });

  it("does not accept native MON as a donation asset", async function () {
    const { emotePay } = await fundAndApprove({ amount: prices[0].amount });
    const data = encodeFunctionData({
      abi: emotePay.abi,
      functionName: "donate",
      args: [creator.account.address, prices[0].emoteId],
    });

    await assert.rejects(
      donor.sendTransaction({
        account: donor.account,
        to: emotePay.address,
        data,
        value: 1n,
      }),
    );
  });
});
