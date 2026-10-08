import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPrivyUserEthereumWalletAddresses,
  isCreatorPrivyUser,
} from "../lib/creator-identity";

describe("creator identity helpers", function () {
  const creator = "0x27711734aC6865d99f9bbDCBAE2730674275E749";

  it("matches the configured creator against linked ethereum wallets", function () {
    const user = {
      linked_accounts: [
        { type: "email", address: "creator@example.com" },
        {
          type: "wallet",
          chain_type: "ethereum",
          address: creator.toLowerCase(),
        },
      ],
    };

    assert.equal(isCreatorPrivyUser(user, creator), true);
  });

  it("does not authorize a user without the configured wallet", function () {
    const user = {
      linked_accounts: [
        {
          type: "wallet",
          chain_type: "ethereum",
          address: "0x9E3481E9A3bd124906408d018773170e0e022280",
        },
      ],
    };

    assert.equal(isCreatorPrivyUser(user, creator), false);
  });

  it("ignores malformed and non-ethereum wallet accounts", function () {
    const user = {
      linked_accounts: [
        { type: "wallet", chain_type: "solana", address: creator },
        { type: "wallet", chain_type: "ethereum", address: "not-an-address" },
      ],
    };

    assert.deepEqual(getPrivyUserEthereumWalletAddresses(user), []);
    assert.equal(isCreatorPrivyUser(user, creator), false);
  });
});
