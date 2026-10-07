import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeFunctionData,
  getAddress,
  parseSignature,
  zeroAddress,
  type Hex,
} from "viem";

describe("EmotePay", async function () {
  const { viem, networkHelpers } = await network.create();
  const [deployer, donor, creator, otherCreator] = await viem.getWalletClients();

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

  async function signReceiveAuthorization({
    amount,
    creatorAddress = creator.account.address,
    donorAddress = donor.account.address,
    emoteId = prices[0].emoteId,
    randomSalt,
    validAfter = 0n,
    validBefore = 9_999_999_999n,
  }: {
    amount: bigint;
    creatorAddress?: `0x${string}`;
    donorAddress?: `0x${string}`;
    emoteId?: bigint;
    randomSalt: Hex;
    validAfter?: bigint;
    validBefore?: bigint;
  }) {
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);
    const nonce = await emotePay.read.computeDonationAuthorizationNonce([
      donorAddress,
      creatorAddress,
      emoteId,
      amount,
      randomSalt,
    ]);
    const signature = await donor.signTypedData({
      account: donor.account,
      domain: {
        name: "USDC",
        version: "2",
        chainId: 31337,
        verifyingContract: usdc.address,
      },
      primaryType: "ReceiveWithAuthorization",
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      message: {
        from: donorAddress,
        to: emotePay.address,
        value: amount,
        validAfter,
        validBefore,
        nonce,
      },
    });
    const { v, r, s } = parseSignature(signature);

    return {
      emotePay,
      usdc,
      nonce,
      validAfter,
      validBefore,
      randomSalt,
      v: Number(v),
      r,
      s,
    };
  }

  async function fundAndAuthorize({
    amount,
    mintAmount = amount,
    creatorAddress = creator.account.address,
    emoteId = prices[0].emoteId,
    randomSalt = "0x0000000000000000000000000000000000000000000000000000000000000001",
  }: {
    amount: bigint;
    mintAmount?: bigint;
    creatorAddress?: `0x${string}`;
    emoteId?: bigint;
    randomSalt?: Hex;
  }) {
    const authorization = await signReceiveAuthorization({
      amount,
      creatorAddress,
      emoteId,
      randomSalt,
    });

    await authorization.usdc.write.mint([donor.account.address, mintAmount], {
      account: deployer.account,
    });

    return authorization;
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

  it("transfers the exact USDC price with receiveWithAuthorization and emits the canonical Donation event", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });
    const { emotePay, usdc, validAfter, validBefore, randomSalt, v, r, s } =
      authorization;

    assert.equal(
      await usdc.read.allowance([donor.account.address, emotePay.address]),
      0n,
    );

    await viem.assertions.emitWithArgs(
      emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          validAfter,
          validBefore,
          randomSalt,
          v,
          r,
          s,
        ],
        { account: deployer.account },
      ),
      emotePay,
      "Donation",
      [donor.account.address, creator.account.address, amount, prices[0].emoteId],
    );

    assert.equal(await usdc.read.balanceOf([donor.account.address]), 0n);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), amount);
    assert.equal(await usdc.read.balanceOf([emotePay.address]), 0n);
    assert.equal(
      await usdc.read.authorizationState([donor.account.address, authorization.nonce]),
      true,
    );
  });

  it("does not add persistent USDC custody when unrelated dust already exists", async function () {
    const amount = prices[0].amount;
    const dust = 7n;
    const authorization = await fundAndAuthorize({ amount });
    const { emotePay, usdc, validAfter, validBefore, randomSalt, v, r, s } =
      authorization;

    await usdc.write.mint([emotePay.address, dust], {
      account: deployer.account,
    });

    await emotePay.write.donateWithAuthorization(
      [
        donor.account.address,
        creator.account.address,
        prices[0].emoteId,
        validAfter,
        validBefore,
        randomSalt,
        v,
        r,
        s,
      ],
      { account: deployer.account },
    );

    assert.equal(await usdc.read.balanceOf([emotePay.address]), dust);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), amount);
  });

  it("reverts receive authorization donations from the zero donor address", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          zeroAddress,
          creator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.emotePay,
      "InvalidDonor",
    );
  });

  it("prevents direct EOA consumption of an EmotePay receive authorization", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });

    await viem.assertions.revertWithCustomError(
      authorization.usdc.write.receiveWithAuthorization(
        [
          donor.account.address,
          authorization.emotePay.address,
          amount,
          authorization.validAfter,
          authorization.validBefore,
          authorization.nonce,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "CallerMustBePayee",
    );
  });

  it("reverts when a relayer changes the committed creator", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          otherCreator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "InvalidSignature",
    );

    assert.equal(await authorization.usdc.read.balanceOf([donor.account.address]), amount);
    assert.equal(
      await authorization.usdc.read.balanceOf([otherCreator.account.address]),
      0n,
    );
  });

  it("reverts when a relayer changes the committed emote ID", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[1].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "InvalidSignature",
    );

    assert.equal(await authorization.usdc.read.balanceOf([donor.account.address]), amount);
    assert.equal(await authorization.usdc.read.balanceOf([creator.account.address]), 0n);
  });

  it("reverts when a relayer changes the committed random salt", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });
    const changedSalt =
      "0x0000000000000000000000000000000000000000000000000000000000000002";

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          changedSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "InvalidSignature",
    );

    assert.equal(await authorization.usdc.read.balanceOf([donor.account.address]), amount);
    assert.equal(await authorization.usdc.read.balanceOf([creator.account.address]), 0n);
  });

  it("reverts when a signature was made for a non-contract price", async function () {
    const amount = prices[0].amount - 1n;
    const authorization = await fundAndAuthorize({ amount });

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "InvalidSignature",
    );

    assert.equal(await authorization.usdc.read.balanceOf([donor.account.address]), amount);
    assert.equal(await authorization.usdc.read.balanceOf([creator.account.address]), 0n);
  });

  it("rejects replayed receive authorizations", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({
      amount,
      mintAmount: amount * 2n,
    });

    await authorization.emotePay.write.donateWithAuthorization(
      [
        donor.account.address,
        creator.account.address,
        prices[0].emoteId,
        authorization.validAfter,
        authorization.validBefore,
        authorization.randomSalt,
        authorization.v,
        authorization.r,
        authorization.s,
      ],
      { account: deployer.account },
    );

    await viem.assertions.revertWithCustomError(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
      authorization.usdc,
      "AuthorizationAlreadyUsed",
    );

    assert.equal(await authorization.usdc.read.balanceOf([creator.account.address]), amount);
  });

  it("allows repeated identical donations with distinct salts", async function () {
    const amount = prices[0].amount;
    const { emotePay, usdc } =
      await networkHelpers.loadFixture(deployEmotePay);
    const salts = [
      "0x1000000000000000000000000000000000000000000000000000000000000001",
      "0x1000000000000000000000000000000000000000000000000000000000000002",
    ] as const;

    await usdc.write.mint([donor.account.address, amount * 2n], {
      account: deployer.account,
    });

    for (const randomSalt of salts) {
      const nonce = await emotePay.read.computeDonationAuthorizationNonce([
        donor.account.address,
        creator.account.address,
        prices[0].emoteId,
        amount,
        randomSalt,
      ]);
      const signature = await donor.signTypedData({
        account: donor.account,
        domain: {
          name: "USDC",
          version: "2",
          chainId: 31337,
          verifyingContract: usdc.address,
        },
        primaryType: "ReceiveWithAuthorization",
        types: {
          ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        message: {
          from: donor.account.address,
          to: emotePay.address,
          value: amount,
          validAfter: 0n,
          validBefore: 9_999_999_999n,
          nonce,
        },
      });
      const { v, r, s } = parseSignature(signature);

      await emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          0n,
          9_999_999_999n,
          randomSalt,
          Number(v),
          r,
          s,
        ],
        { account: deployer.account },
      );
    }

    assert.equal(await usdc.read.balanceOf([donor.account.address]), 0n);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), amount * 2n);
    assert.equal(await usdc.read.balanceOf([emotePay.address]), 0n);
  });

  it("reverts the whole receive authorization transaction when creator forwarding fails", async function () {
    const amount = prices[0].amount;
    const authorization = await fundAndAuthorize({ amount });

    await authorization.usdc.write.setTransferRevertsFor(
      [creator.account.address, true],
      { account: deployer.account },
    );

    await assert.rejects(
      authorization.emotePay.write.donateWithAuthorization(
        [
          donor.account.address,
          creator.account.address,
          prices[0].emoteId,
          authorization.validAfter,
          authorization.validBefore,
          authorization.randomSalt,
          authorization.v,
          authorization.r,
          authorization.s,
        ],
        { account: deployer.account },
      ),
    );

    assert.equal(await authorization.usdc.read.balanceOf([donor.account.address]), amount);
    assert.equal(await authorization.usdc.read.balanceOf([creator.account.address]), 0n);
    assert.equal(await authorization.usdc.read.balanceOf([authorization.emotePay.address]), 0n);
    assert.equal(
      await authorization.usdc.read.authorizationState([
        donor.account.address,
        authorization.nonce,
      ]),
      false,
    );
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
