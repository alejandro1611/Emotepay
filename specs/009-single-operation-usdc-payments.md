# SPEC-009 - Single-Operation USDC Payments

## Status

VERIFYING

## Approval Record

Architecture review: PASS
Architect recommendation: READY FOR HUMAN ARCHITECTURE DECISION
Human architecture approval: Explicitly granted in conversation for the revised `receiveWithAuthorization` architecture.
Implementation status: BLOCKER FIXES COMPLETE; AWAITING INDEPENDENT REVIEW

State history:

- DRAFT: Initial prospective architecture specification drafted.
- APPROVED: Human approval explicitly granted for EIP-3009 `receiveWithAuthorization`, EmotePay V3 as signed payee, relayed `donateWithAuthorization`, and donation-bound nonce commitment.
- IMPLEMENTING: Implementer began the approved SPEC-009 work.
- VERIFYING: Pre-deployment blocker fixes were implemented and validation passed; ready for independent deployment review.

## Goal

Redesign the post-SPEC-008 USDC donation architecture so a viewer can select a reaction, authorize it once, and produce one USDC donation that transfers the exact amount to the creator and emits the canonical `Donation` event.

The desired product experience is:

viewer selects reaction -> one meaningful confirmation -> creator receives exact USDC -> `Donation(donor, creator, amount, emoteId)` is emitted -> OBS, Envio, and the creator dashboard continue working.

## Current State

Current V2 flow:

1. Viewer signs and sends `USDC.approve(EmotePay, exactAmount)`.
2. Viewer signs and sends `EmotePay.donate(creator, emoteId)`.
3. `EmotePay` calls `USDC.transferFrom(viewer, creator, amount)`.
4. `EmotePay` emits `Donation(donor, creator, amount, emoteId)`.

Current public identifiers:

- EmotePay V2: `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A`
- Monad Testnet USDC: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- Monad Testnet chain ID: `10143`
- Donation event shape: `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`

Current constraints to preserve:

- Reaction prices are defined onchain by EmotePay.
- Creator receives the exact USDC amount.
- EmotePay keeps zero normal custody.
- Native MON is gas only, not the donation asset.
- Invalid emote IDs revert.
- Zero creator address reverts.
- Self-donation reverts.
- No protocol fee.
- No arbitrary token selection.
- OBS and Envio continue consuming the same `Donation` event shape.

## Investigation Summary

### Exact Monad Testnet USDC Capabilities

Read-only RPC probes against `0x534b2f3A21130d7a60830c2Df862319e593943A3` on chain ID `10143` confirmed:

- `name()` returns `USDC`.
- `symbol()` returns `USDC`.
- `decimals()` returns `6`.
- `DOMAIN_SEPARATOR()` is present.
- `nonces(address)` is present.
- `authorizationState(address,bytes32)` is present.
- `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` is present; invalid test signature reached the expected `EIP2612: invalid signature` path.
- `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` is present; invalid test signature reached the expected `FiatTokenV2: invalid signature` path.
- `receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` is present; a probe with `to != msg.sender` reached the expected `FiatTokenV2: caller must be the payee` path.
- `cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)` is present; invalid test signature reached the expected `FiatTokenV2: invalid signature` path.
- ERC-1363-style `transferAndCall` / `approveAndCall` support was not confirmed; standard selector probes reverted without a recognizable supported-function path.
- ERC-165 `supportsInterface` probes reverted, so ERC-1363 support must be treated as unavailable for this spec.

Official supporting references:

- Circle confirms Monad USDC testnet address `0x534b2f3A21130d7a60830c2Df862319e593943A3`: https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad
- Circle describes `approve`, EIP-2612 `permit`, EIP-3009 `transferWithAuthorization`, `receiveWithAuthorization`, and Permit2 authorization models: https://www.circle.com/es/blog/four-ways-to-authorize-usdc-smart-contract-interactions-with-circle-sdk
- ERC-3009 recommends `receiveWithAuthorization` instead of `transferWithAuthorization` for smart-contract wrapper calls because a transfer authorization can be extracted and front-run without invoking the wrapper: https://eips.ethereum.org/EIPS/eip-3009
- Monad token list confirms chain ID `10143`, USDC address, symbol, and 6 decimals: https://github.com/monad-crypto/token-list/blob/main/tokenlist-testnet.json

### Current Privy Capabilities

Current repository configuration:

- `app/providers.tsx` uses `PrivyProvider`.
- Login methods are Google and email.
- Embedded Ethereum wallets are configured with `createOnLogin: "users-without-wallets"`.
- No `SmartWalletsProvider` is mounted.
- No `smartWallets` config is present.
- The active payment code uses `useWallets()` and `useSendTransaction()` from `@privy-io/react-auth`.
- The app identifies Privy embedded EVM wallets with `wallet.type === "ethereum"` and `wallet.walletClientType === "privy" || "privy-v2"`.

Installed Privy package capabilities:

- `useSendTransaction` supports embedded-wallet transaction prompts and has a `sponsor?: boolean` option.
- `useSignTypedData` is exported and supports EIP-712 typed-data signatures.
- Privy docs and installed types show that signing typed data is a distinct prompt by default unless wallet UIs are disabled at configuration level.
- `@privy-io/react-auth/smart-wallets` exports `SmartWalletsProvider` and `useSmartWallets`.
- The smart wallet client type can send user operations and sign typed data, but this architecture is not wired into the current app.
- Smart-wallet batching would require smart-wallet configuration, a bundler, and likely paymaster configuration for the target Monad network.
- Privy signer/delegated-action flows can enable server-side wallet actions, but they require explicit user consent, dashboard/server setup, and careful policy controls.

Official supporting references:

- Privy `sendTransaction` docs show `sponsor?: boolean` and wallet UI options: https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction
- Privy signer setup requires dashboard/server setup and user consent: https://docs.privy.io/wallets/using-wallets/signers/setup
- Installed `@privy-io/react-auth` types expose `useSignTypedData`, smart wallet hooks, and `SmartWalletsProvider`.

## Important Distinctions

The spec must not collapse these concepts:

- One visible modal: what the user sees in Privy.
- One wallet signature: an offchain authorization signature.
- One user confirmation: a meaningful user act of consent.
- One blockchain transaction: a submitted onchain transaction.

A design can be one blockchain transaction but still require two user-visible confirmations if the viewer must sign typed data and then confirm an EVM transaction.

## Architecture Options

| Option | Onchain tx per donation | User signatures | User-visible confirmations | Creator receives directly | Donation emitted | Backend/relayer | Allowance risk | Works with exact Monad USDC | Complexity | Hackathon risk | Summary |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Current exact approve + donate | 2 when allowance absent, 1 when sufficient | 2 or 1 tx signatures | 2 or 1 | Yes | Yes | No | Exact approval to EmotePay | Yes | Low | Low | Secure and already proven, but poor first-donation UX. |
| B. Larger allowance + donate | 2 first time, 1 later | 2 first time, 1 later | 2 first time, 1 later | Yes | Yes | No | Higher standing allowance | Yes | Low | Medium | Improves repeat donations but violates the no-unlimited/no-large-allowance product direction. |
| C. EIP-2612 permit + user-submitted `donateWithPermit` | 1 | 1 typed-data signature + 1 tx signature | 2 by default | Yes | Yes | No | Exact allowance, consumed in same tx | Yes | Medium | Medium | Strong no-relayer fallback; true one onchain tx but not one visible confirmation. |
| D. EIP-3009 `transferWithAuthorization` + relayed `donateWithAuthorization` | 1 | 1 typed-data signature | 1 | Yes | Yes only if submitted through EmotePay | Yes | None | Yes | Medium | Medium-high | Good UX but rejected as primary because the authorization can be extracted and consumed directly on USDC, bypassing EmotePay event emission. |
| D2. EIP-3009 `receiveWithAuthorization` to EmotePay then atomic forward | 1 | 1 typed-data signature | 1 with relayer | Not directly; EmotePay receives then forwards in the same tx | Yes | Yes | None | Yes | Medium | Medium | Recommended. Prevents direct EOA consumption of the authorization and preserves event emission with transient atomic custody. |
| E. Permit2 | 2 first time due Permit2 approval, 1 later | 2 first time, 1 later | 2 first time, 1 later | Yes | Yes | Optional | Permit2 approval required | Permit2 exists on Monad, but USDC approval to Permit2 still needed | High | High | Not a first-donation solution; useful only for repeat users after Permit2 setup. |
| F. Smart wallet / ERC-4337 batch approve + donate | 1 user operation | 1 user-op signature | Potentially 1 | Yes | Yes | Bundler/paymaster required | Exact internal approval can be batched | Token yes; wallet infra not currently configured | High | High | Can batch current calls but requires migrating users to smart wallets and AA infrastructure. |
| G. Relayed/meta-transaction with custom EmotePay authorization | 1 | 1 typed-data signature | 1 | Only if combined with token authorization | Yes | Yes | Depends on token mechanism | Needs EIP-2612/EIP-3009 pairing | High | Medium-high | Strongest intent binding if paired with token auth, but usually needs two signatures unless token auth also carries enough intent. |
| H. Privy gas sponsorship only | Same as underlying flow | Same as underlying flow | Same as underlying flow | Yes | Yes | Privy/paymaster | Same as underlying flow | Not enough by itself | Low-medium | Medium | Can improve gas UX but does not remove approve + donate. |

## Recommended Option

Use EIP-3009 `receiveWithAuthorization` with a new EmotePay V3 relayed donation function.

This is the best match for the desired consumer UX and security model because the exact Monad Testnet USDC contract supports EIP-3009 `receiveWithAuthorization`, and ERC-3009 explicitly recommends `receiveWithAuthorization` for smart-contract wrapper flows. `receiveWithAuthorization` requires `msg.sender == to`, so the signed authorization can only be consumed by the signed payee contract.

The tradeoff is that USDC moves viewer -> EmotePay -> creator inside one atomic transaction. This is transient atomic custody, not persistent custody, as long as the contract forwards the exact amount before returning and reverts the whole transaction if forwarding fails.

Proposed function shape:

```solidity
function donateWithAuthorization(
    address donor,
    address creator,
    uint256 emoteId,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 randomSalt,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

The function does not accept `amount` or `nonce` from the caller. It resolves the exact amount from `getEmotePrice(emoteId)` and recomputes the nonce commitment from the donation payload.

Exact signed EIP-712 payload:

```text
domain:
  name: USDC
  version: 2
  chainId: 10143
  verifyingContract: 0x534b2f3A21130d7a60830c2Df862319e593943A3

primaryType:
  ReceiveWithAuthorization

types:
  ReceiveWithAuthorization:
    from: address
    to: address
    value: uint256
    validAfter: uint256
    validBefore: uint256
    nonce: bytes32

message:
  from: <viewer embedded wallet>
  to: <EmotePay V3 contract address>
  value: <getEmotePrice(emoteId)>
  validAfter: <unix timestamp lower bound, usually current time or 0>
  validBefore: <short unix timestamp expiration>
  nonce: <committed donation nonce>
```

Exact nonce construction:

```solidity
bytes32 public constant DONATION_AUTHORIZATION_NONCE_DOMAIN =
    keccak256("EmotePay.receiveWithAuthorizationDonation.v1");

function computeDonationAuthorizationNonce(
    address donor,
    address creator,
    uint256 emoteId,
    uint256 exactPrice,
    bytes32 randomSalt
) public view returns (bytes32) {
    return keccak256(
        abi.encode(
            DONATION_AUTHORIZATION_NONCE_DOMAIN,
            block.chainid,
            address(this),
            address(usdc),
            donor,
            creator,
            emoteId,
            exactPrice,
            randomSalt
        )
    );
}
```

`randomSalt` must be generated by the frontend with cryptographically strong randomness for every donation attempt. It allows repeated identical donations while still producing distinct EIP-3009 nonces. The contract must recompute this nonce before consuming the authorization, and must pass only the recomputed nonce to USDC.

Proposed contract flow:

1. Validate `creator != address(0)`.
2. Validate `donor != creator`.
3. Resolve `amount = getEmotePrice(emoteId)`, reverting for invalid emote IDs.
4. Recompute `nonce = computeDonationAuthorizationNonce(donor, creator, emoteId, amount, randomSalt)`.
5. Call `usdc.receiveWithAuthorization(donor, address(this), amount, validAfter, validBefore, nonce, v, r, s)`.
6. Forward the exact `amount` from EmotePay to `creator` with safe ERC-20 transfer.
7. Emit `Donation(donor, creator, amount, emoteId)` only after the creator transfer succeeds.
8. Revert the whole transaction if the receive or forward step fails.
9. Keep no persistent custody balance and no donation history.

Proposed viewer flow:

1. Viewer selects Hype Fire or another fixed reaction.
2. Frontend reads the V3 contract's configured USDC and `getEmotePrice(emoteId)`.
3. Frontend validates viewer USDC balance and creator/self-donation state.
4. Frontend generates a cryptographically random `bytes32 randomSalt`.
5. Frontend computes the committed nonce using the same fields as `computeDonationAuthorizationNonce`.
6. Frontend creates EIP-3009 `ReceiveWithAuthorization` typed data for exact USDC:
   - `from = viewer`
   - `to = EmotePay V3`
   - `value = getEmotePrice(emoteId)`
   - `validAfter = 0` or current timestamp guard
   - `validBefore = short expiration`
   - `nonce = committed donation nonce`
   - domain uses exact Monad Testnet USDC, chain ID `10143`, token name `USDC`, and token version `2`.
7. Viewer signs one typed-data authorization in Privy.
8. Frontend sends the signature, `donor`, `creator`, `emoteId`, validity window, and `randomSalt` to an EmotePay backend relayer.
9. Backend validates authenticated request, creator, emote, amount, chain ID, computed nonce, validity window, and configured V3 address.
10. Backend submits one Monad Testnet transaction to `donateWithAuthorization`.
11. Frontend waits for the relayed transaction hash/receipt.
12. OBS and Envio consume the normal `Donation` event.

## Does Recommended Option Achieve the Target?

- One onchain transaction: YES.
- One wallet signature: YES, the EIP-3009 `ReceiveWithAuthorization` typed-data signature.
- One visible confirmation: YES by default, assuming only the typed-data signature is shown to the viewer and the backend relays the transaction.
- No unlimited allowance: YES.
- No USDC allowance at all: YES.
- No persistent EmotePay custody: YES.
- Transient atomic EmotePay custody: YES, viewer -> EmotePay -> creator inside the same transaction.
- Creator receives USDC by the end of the transaction: YES.
- `Donation` emitted: YES when the relayer submits through EmotePay.
- OBS/Envio/dashboard compatibility: YES, same event shape and 6-decimal amount semantics.

## Threat Model

Primary threats:

- A relayer or mempool observer tries to change the creator.
- A relayer tries to change `emoteId`.
- A relayer tries to change amount.
- A relayer or observer tries to consume the authorization directly on USDC.
- A relayer retries a consumed or expired authorization.
- A frontend bug attempts duplicate donation submission.
- A malicious frontend attempts arbitrary price selection.

Mitigations:

- `to = address(EmotePay V3)` in the signed USDC authorization.
- USDC `receiveWithAuthorization` requires `msg.sender == to`, so an arbitrary EOA cannot consume the authorization directly.
- The nonce commits to `chainId`, `address(this)`, `address(usdc)`, `donor`, `creator`, `emoteId`, exact contract-defined price, and `randomSalt`.
- The contract recomputes the nonce after resolving `amount = getEmotePrice(emoteId)`.
- Any relayer change to creator, emote ID, amount, chain, contract, or token produces a different nonce and invalidates the signature.
- EIP-3009 `authorizationState(authorizer, nonce)` provides token-level replay protection after consumption.
- `validBefore` must be short.
- `randomSalt` must be unique per donation attempt.
- The relayer must never log raw signatures.
- The frontend must treat expired or consumed authorizations as failed and require a new signature.

## Implementation Evidence

Pre-deployment blocker fixes:

- Relayer rejects not-yet-valid authorizations when `validAfter > currentTime`.
- Relayer rejects expired authorizations when `currentTime >= validBefore`.
- Relayer reads official USDC `authorizationState(donor, nonce)` before any broadcast and refuses to broadcast if the state check fails or returns used/cancelled.
- Relayer uses an MVP in-memory donor+nonce pending lock to prevent duplicate concurrent submissions in a single server process.
- Relayer retains the first transaction hash for a donor+nonce and returns that hash for duplicate requests instead of broadcasting again.
- The in-memory lock/hash cache is not production-grade distributed rate limiting; multi-instance/serverless deployments must use shared storage or a queue for equivalent protection.
- EmotePay V3 explicitly rejects `donor == address(0)` before consuming authorization.
- EmotePay V3 replaces the post-forward `assert` with a custom-error revert enforcing `USDC balance after == USDC balance before`.
- V3 payment runtime now requires explicit `NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS`; it no longer falls back to the historical V2 address.
- Historical V2 address remains documented as `EMOTEPAY_V2_CONTRACT_ADDRESS` and must not be modified during V3 deployment.

Post-deployment runtime configuration:

- Frontend and relayer must be configured with `NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS` only after V3 deployment.
- OBS must be configured to the V3 contract address for V3 live reactions.
- Envio must be configured to the V3 contract address and V3 deployment/start block.
- V1 MON and V2 USDC deployments remain historical infrastructure and must not be modified by SPEC-009.

Validation after blocker fixes:

- `npm run test:contracts`: PASS, 28 passing.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run indexer:codegen`: PASS.
- `npm run indexer:typecheck`: PASS.
- `npx next build --webpack`: PASS, with the existing Privy optional `@farcaster/mini-app-solana` warning.

## Front-Running Analysis

The earlier `transferWithAuthorization` recommendation is vulnerable to the ERC-3009 wrapper front-running issue: once the wrapper transaction is visible, an observer can extract the authorization and call USDC directly, consuming the nonce without invoking EmotePay. That could make the creator receive funds without `Donation` event emission, breaking OBS and Envio.

The revised `receiveWithAuthorization` design prevents that direct extraction path because USDC checks that `to == msg.sender`. Since the signed `to` is EmotePay V3, an arbitrary EOA or different contract cannot consume the authorization. A front-runner can copy the entire EmotePay `donateWithAuthorization` call, but that still invokes EmotePay, preserves the committed creator/emote/amount, forwards USDC atomically, and emits `Donation`. The copied transaction would consume the nonce first; the relayer's later transaction would revert or fail, but the donation semantics would still be preserved.

## Relayer Trust Assumptions

The relayer is trusted for availability and gas sponsorship, not for custody or payment correctness.

The relayer can:

- refuse or delay submission;
- choose gas parameters;
- submit the exact signed payload through EmotePay;
- cause a failed UX if it mishandles receipts.

The relayer cannot, if the contract is implemented as specified:

- change the creator;
- change the emote ID;
- change the amount;
- redirect USDC;
- consume the authorization directly through USDC;
- replay a consumed authorization.

## Atomicity and Custody Analysis

Persistent custody means EmotePay can retain viewer funds after a successful transaction, expose a withdraw path, or leave balances requiring later operator action. Persistent custody remains disallowed.

Transient atomic custody means EmotePay receives USDC and forwards it to the creator in the same transaction, with the entire transaction reverting if the forward fails. This design uses transient atomic custody.

This does not conflict with the project's zero-custody requirement if the approved requirement is clarified as "zero persistent custody" and if tests prove:

- successful donations leave EmotePay with zero USDC;
- failed creator forwards revert the whole transaction;
- no admin withdrawal is added;
- no balance bookkeeping or delayed settlement is added.

If human architecture direction requires strict direct viewer -> creator token movement with no transient contract balance even inside one transaction, then this revised recommendation is not acceptable and the project must choose between the weaker `transferWithAuthorization` event-bypass risk, EIP-2612 `permit + donateWithPermit`, or the current approve/donate flow.

## Second-Best Fallback

Use EIP-2612 `permit` with user-submitted `donateWithPermit`.

This fallback:

- Reduces first-time donation from two onchain transactions to one.
- Keeps the transaction signed by the viewer, so the creator and `emoteId` are included in the viewer's transaction authorization.
- Avoids backend relayer trust.
- Uses exact allowance and consumes it in the same transaction.
- Still requires two user-visible actions in normal Privy UX: one typed-data signature and one transaction confirmation.

This is the best fallback if the human architecture decision rejects either a backend relayer or transient atomic custody.

## Requirements

### REQ-001

The new flow must preserve USDC as the only donation asset.

### REQ-002

The new flow must keep reaction prices defined by EmotePay onchain.

### REQ-003

The new flow must transfer exactly `getEmotePrice(emoteId)` USDC base units.

### REQ-004

The new flow must reject invalid emote IDs.

### REQ-005

The new flow must reject zero creator address.

### REQ-006

The new flow must reject self-donation.

### REQ-007

The new flow must emit `Donation(donor, creator, amount, emoteId)` only after successful USDC movement.

### REQ-008

The recommended implementation must use the exact Monad Testnet USDC contract at `0x534b2f3A21130d7a60830c2Df862319e593943A3`.

### REQ-009

The recommended implementation must use EIP-3009 `receiveWithAuthorization` for the primary path unless human architecture approval chooses the fallback.

### REQ-010

The primary path must not create USDC allowance.

### REQ-011

The primary path must require only one viewer wallet signature.

### REQ-012

The primary path must submit only one onchain transaction per donation.

### REQ-013

The primary path must support relayed submission without requiring the viewer to hold MON for donation gas.

### REQ-014

The frontend must distinguish the primary signature flow from a normal transaction confirmation.

### REQ-015

The relayer must validate chain ID, contract address, USDC address, creator address, donor address, emote ID, price, validity window, `randomSalt`, and committed nonce before submitting.

### REQ-016

The relayer must not log raw signatures or secret values.

### REQ-017

The relayer must return the donation transaction hash to the frontend.

### REQ-018

OBS and Envio must continue consuming the canonical `Donation` event shape.

### REQ-019

The creator dashboard must continue treating `Donation.amount` as 6-decimal USDC base units.

### REQ-020

V1 MON infrastructure and V2 USDC history must remain identifiable and untouched.

### REQ-021

The primary path must sign EmotePay V3 as the EIP-3009 `to` payee.

### REQ-022

The primary path must commit the intended donation payload into the EIP-3009 `nonce`.

### REQ-023

The contract must recompute the committed nonce before calling USDC.

### REQ-024

The contract must forward the exact received USDC amount to the selected creator in the same transaction.

### REQ-025

The contract must retain zero USDC after successful execution.

## Security Requirements

### SEC-001

The frontend must not be trusted for reaction price.

### SEC-002

The implementation must not request unlimited approval.

### SEC-003

The primary EIP-3009 authorization must use a short validity window.

### SEC-004

The primary EIP-3009 authorization must use a committed nonce derived from a unique random `bytes32 randomSalt`.

### SEC-005

The contract must call USDC with the amount resolved from `getEmotePrice(emoteId)`, not an arbitrary frontend amount.

### SEC-006

The contract must not use `tx.origin`.

### SEC-007

The contract must not add admin withdrawals.

### SEC-008

The contract must not add arbitrary token support.

### SEC-009

The contract must not add upgradeability as part of SPEC-009.

### SEC-010

The contract must not add protocol fees as part of SPEC-009.

### SEC-011

The relayer must not be able to redirect funds away from EmotePay V3 or the committed creator.

### SEC-012

The spec must document why `transferWithAuthorization` is rejected for the primary wrapper flow and why `receiveWithAuthorization` prevents arbitrary direct EOA consumption.

### SEC-013

The relayer must not hold viewer private keys.

### SEC-014

The frontend must not modify `node_modules` as part of payment architecture.

### SEC-015

Duplicate submissions must rely on EIP-3009 nonce consumption and transaction receipt checks; the frontend must not blindly retry by creating ambiguous duplicate signatures.

### SEC-016

The contract must ensure any failed creator forward reverts the entire transaction.

### SEC-017

The implementation must not add persistent custody, delayed settlement, or admin withdrawal paths.

## Non-Functional Requirements

### NFR-001

The implementation should fit the existing Next.js, React, Privy, viem, Hardhat, Solidity, OBS, and Envio stack.

### NFR-002

The primary viewer flow should feel like one payment authorization, not a crypto approve-then-pay sequence.

### NFR-003

The architecture should minimize trust while acknowledging any relayer trust explicitly.

### NFR-004

The implementation should be feasible before the hackathon deadline.

### NFR-005

The design must preserve OBS deduplication by transaction hash and log index.

### NFR-006

The design must preserve Envio stable donation identity by transaction hash and log index.

### NFR-007

The design must explicitly distinguish persistent custody from transient atomic custody in user-facing architecture documentation.

## Expected File Changes If Approved

Potential implementation files:

- `contracts/EmotePay.sol`
- `test/EmotePay.ts`
- `lib/generated/emotePayAbi.ts`
- `scripts/deploy-emotepay.ts` or a new V3 deployment script
- `app/page.tsx`
- `app/providers.tsx` only if Privy configuration changes are needed
- `lib/contracts.ts`
- `lib/emotes.ts` only if display copy changes are needed
- `app/api/...` new relayer route or dedicated backend route
- `.env.example` for relayer configuration names only
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STATUS.md`
- `indexer/config.yaml` only after a new V3 deployment is approved

Files that should not be modified for this spec:

- `node_modules`
- `.env.local`
- historical V1 deployment records except documentation references

## Migration Impact

### Contract

SPEC-009 should deploy a new EmotePay V3 contract if approved. V2 should remain historical USDC infrastructure.

### Frontend

The frontend would replace approve/donate orchestration with typed-data construction, Privy `useSignTypedData`, relayer submission, and receipt polling.

### Backend / Relayer

The primary recommendation requires a backend relayer funded with MON for gas. The relayer is not a custodian, but it is responsible for submitting signed donation authorizations through EmotePay.

### OBS

No event ABI change is required. OBS must update only the active contract address after V3 deployment approval. Creator filtering, txHash/logIndex deduplication, sequential queueing, emote mapping, and 6-decimal USDC formatting remain unchanged.

### Envio

No schema change is required. Envio must update contract address and start block after V3 deployment approval. Amount semantics remain USDC base units.

## Acceptance Criteria

### AC-001

Read-only verification confirms Monad Testnet USDC still supports `receiveWithAuthorization`.

### AC-002

Read-only verification confirms Monad Testnet USDC still supports `authorizationState`.

### AC-003

Unit tests prove `donateWithAuthorization` transfers exact USDC from donor to creator.

### AC-004

Unit tests prove `donateWithAuthorization` emits the canonical `Donation` event after successful transfer.

### AC-005

Unit tests prove invalid emote IDs revert.

### AC-006

Unit tests prove zero creator address reverts.

### AC-007

Unit tests prove self-donation reverts.

### AC-008

Unit tests prove native MON value is rejected.

### AC-009

Unit tests prove the contract does not retain USDC after successful donation.

### AC-010

Frontend tests or code review prove the viewer cannot select arbitrary amount.

### AC-011

Frontend tests or code review prove typed-data amount comes from the contract price read.

### AC-012

Relayer tests prove invalid chain ID, contract address, creator, emote ID, price, committed nonce, and expired authorization are rejected before submission.

### AC-013

A real Monad Testnet smoke test proves one viewer signature leads to one relayed donation transaction.

### AC-014

A real Monad Testnet smoke test proves creator receives exact USDC.

### AC-015

A real Monad Testnet smoke test proves EmotePay V3 retains zero USDC.

### AC-016

OBS receives and renders the V3 `Donation` event with USDC formatting.

### AC-017

Envio indexes the V3 `Donation` event with 6-decimal USDC formatting.

### AC-018

The creator dashboard displays the V3 donation correctly.

### AC-019

No production code is implemented before human approval of this DRAFT.

### AC-020

Unit tests prove changing creator after signature invalidates the committed nonce and reverts.

### AC-021

Unit tests prove changing `emoteId` after signature invalidates the committed nonce and reverts.

### AC-022

Unit tests prove changing price semantics or using a frontend-provided amount cannot succeed.

### AC-023

Unit tests prove repeated identical donations require different `randomSalt` values and therefore different committed nonces.

### AC-024

Unit tests prove a failed creator transfer reverts the entire transaction.

## Architect Review

Architect review result: READY FOR HUMAN ARCHITECTURE DECISION.

Architectural fit:

- The revised EIP-3009 `receiveWithAuthorization` relayed architecture is compatible with the exact Monad Testnet USDC contract and addresses the ERC-3009 wrapper front-running concern that affects `transferWithAuthorization`.
- It best matches the desired viewer UX: one meaningful typed-data confirmation and one onchain donation transaction.
- It avoids unlimited approvals and avoids persistent custody.
- It introduces transient atomic custody inside one transaction, which is architecturally acceptable only if the human explicitly accepts "zero persistent custody" as the governing requirement.
- OBS and Envio impact is low because the event ABI can remain unchanged.
- The nonce commitment scheme binds creator, emote ID, exact contract-defined price, chain, contract, token, donor, and random salt into the USDC authorization nonce.

Blocking issues:

- No implementation should begin until the human explicitly accepts or rejects the relayer trust model and the transient atomic custody model.
- Implementation must re-verify the Monad USDC EIP-712 domain before signing; current read-only verification matches name `USDC`, version `2`, chain ID `10143`, and the canonical USDC address.

Non-blocking recommendations:

- If transient atomic custody is unacceptable, choose the EIP-2612 fallback or remain on the current exact approve + donate flow.
- Keep V2 intact and deploy a new V3 if this spec is approved.
- Add a short expiration, committed nonce generation, no raw signature logging, and receipt-based status handling as hard acceptance criteria.

Missing validation to perform during implementation:

- Re-verify the EIP-712 domain separator required by Monad USDC before signing.
- Verify Privy `useSignTypedData` UX with the actual embedded wallet.
- Verify relayer funding and retry behavior without ever blindly rebroadcasting ambiguous donations.
- Verify `receiveWithAuthorization` cannot be consumed by an arbitrary EOA because `to` is EmotePay V3.
- Verify copied calldata can only preserve, not alter, the committed donation payload.

## Open Questions

1. Is transient atomic custody acceptable if the transaction reverts unless EmotePay forwards the exact USDC amount to the creator and retains zero USDC?
2. Is a backend relayer acceptable for the hackathon UX, including MON gas funding and operational monitoring?
3. What exact short validity window should be used for signed receive authorizations?
4. Should V2 `donate` remain active as a fallback route in the UI after V3 is deployed, or should V3 become the only active frontend contract?

## Recommendation

READY FOR HUMAN ARCHITECTURE DECISION
