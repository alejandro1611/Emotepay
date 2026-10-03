# SPEC-008 — USDC Payment Migration

## Status

IMPLEMENTING

## Approval Record

Architecture review: PASS
Architect recommendation: READY FOR HUMAN APPROVAL
Human approval: Explicitly granted in conversation for SPEC-008
Implementation status: IN PROGRESS

State history:

- DRAFT: Initial prospective specification drafted.
- APPROVED: Human approval explicitly granted after architecture review.
- IMPLEMENTING: Implementer began the approved USDC migration work.

Approved human decisions:

- MVP reaction pricing is approved as `0.10`, `0.50`, `1.00`, and `2.50` USDC for emote IDs `1`, `2`, `3`, and `4`.
- The verified Monad Testnet USDC token is `0x534b2f3A21130d7a60830c2Df862319e593943A3`, symbol `USDC`, decimals `6`.
- The smart contract is the source of truth for reaction prices.
- The contract must expose a public price read helper such as `getEmotePrice(uint256 emoteId)`.
- Frontend presentation may mirror prices, but financial correctness must not depend on local frontend values.
- ERC-20 approvals should prefer the exact required reaction amount for this MVP.
- OpenZeppelin `IERC20` and `SafeERC20` are preferred, adding only `@openzeppelin/contracts` if it is not already installed.
- SPEC-008 remains single-asset USDC with no arbitrary token selection.
- Envio does not need generic multi-asset metadata in this spec.
- `Donation.amount` remains `uint256` base units, now semantically USDC base units.
- The current deployed MON contract is V1 and remains untouched.
- The USDC implementation is a new V2 deployment.
- V2 deployed successfully at `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A` in transaction `0xc63c4745602340f4af758a3c1fa45bf5764e0445f93f43648d8e9f9684902ea5` at block `67874925`.
- Gas sponsorship remains out of scope.

## Goal

Migrate EmotePay's donation asset on Monad Testnet from native MON to official Circle USDC while preserving the core product flow, non-custodial payment model, confirmed-payment UX, OBS alerts, and Envio creator analytics.

## Context

The verified EmotePay V1 flow is:

viewer -> Privy authentication -> Privy embedded EVM wallet -> EmotePay Solidity contract -> creator receives native MON -> Donation event -> realtime OBS overlay -> Envio creator analytics.

SPEC-008 changes the payment asset and contract trust boundary. Native MON is no longer the donation asset. USDC becomes the only supported donation token for this spec, and viewers still need native MON for gas unless a later gas-sponsorship spec changes that.

This is a prospective spec. It does not modify the existing deployed MON contract. The current Monad Testnet MON deployment remains historical V1 infrastructure.

## Current State

The repository currently implements native MON donations.

The current verified flow is:

viewer selects an emote in `app/page.tsx`
-> Privy authentication and embedded EVM wallet readiness are checked
-> creator and contract addresses are read from public environment configuration
-> frontend validates the creator address, contract address, self-donation state, and native MON balance for donation value plus estimated gas
-> frontend switches the embedded wallet to Monad Testnet chain ID `10143`
-> frontend encodes `donate(address,uint256)` with creator address and selected emote onchain ID
-> frontend sends a value-bearing transaction to the configured EmotePay contract
-> `EmotePay.sol` validates nonzero creator, nonzero `msg.value`, and no self-donation
-> `EmotePay.sol` forwards all `msg.value` to the creator with `call`
-> `EmotePay.sol` emits `Donation(donor, creator, amount, emoteId)` only after successful native value forwarding
-> OBS watches the configured contract's `Donation` events, filters to the configured creator, deduplicates by transaction hash and log index, maps known emote IDs, formats `amount` with `formatEther`, and displays `MON`
-> Envio indexes the configured contract `0x039dd378eDD477aa7cd200953254a52D44f844A3` from block `66559947`, stores `Donation.amount` as `BigInt`, updates aggregate totals, and the creator dashboard formats totals with `formatEther` and `MON`.

Current contract behavior in `contracts/EmotePay.sol`:

- `donate(address creator, uint256 emoteId)` is payable.
- `creator == address(0)` reverts with `InvalidCreator`.
- `msg.value == 0` reverts with `ZeroDonation`.
- `msg.sender == creator` reverts with `SelfDonationNotAllowed`.
- The full native `msg.value` is forwarded to `creator`.
- Failed native value forwarding reverts with `TransferFailed`.
- `Donation(msg.sender, creator, msg.value, emoteId)` is emitted after successful forwarding.
- No donation history, admin state, withdrawal path, or pricing table exists.
- The current contract does not validate `emoteId`; it only emits it.

Current frontend payment assumptions:

- Fixed reaction metadata lives in `lib/emotes.ts`.
- Amounts are represented as MON strings and parsed with `parseEther`.
- Balance checks use native balance and estimated contract gas.
- The payment transaction includes native `value`.
- Success is shown only after `waitForTransactionReceipt` returns a successful receipt.
- Duplicate submission is blocked while approval, submission, or confirmation is in progress.

Current OBS and Envio assumptions:

- The canonical event shape is `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`.
- `amount` currently means native MON wei.
- OBS and the creator dashboard format `amount` as 18-decimal MON.
- Envio stores raw `BigInt` amounts and aggregate totals without a separate asset or decimals field.
- Deterministic donation IDs do not make aggregate counter mutations independently idempotent if the same event were processed more than once.

## USDC Verification

Official Circle sources identify Monad USDC as an ERC-20 token and list:

- Monad mainnet USDC address: `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`
- Monad Testnet USDC address: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- Testnet funds source: Circle Faucet

Read-only Monad Testnet RPC checks against `0x534b2f3A21130d7a60830c2Df862319e593943A3` returned:

- `name()`: `USDC`
- `symbol()`: `USDC`
- `decimals()`: `6`

Sources consulted during drafting:

- Circle blog: `https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad`
- Circle Monad page: `https://www.circle.com/multi-chain-usdc/monad`
- Circle Faucet: `https://faucet.circle.com`
- Monad Testnet RPC read-only `eth_call` for `name()`, `symbol()`, and `decimals()`

## Target Flow

viewer selects an emote
-> Privy wallet is available on Monad Testnet
-> frontend displays the intended USDC price from contract-defined or verified mirrored data
-> frontend checks native MON balance for gas
-> frontend checks USDC balance
-> frontend checks USDC allowance for the EmotePay contract
-> if allowance is insufficient, frontend requests an exact USDC approval for the selected emote price and waits for confirmation
-> frontend calls `donate(address creator, uint256 emoteId)` with no native value
-> EmotePay validates creator, donor, emote ID, and configured USDC token
-> EmotePay derives the exact USDC price from `emoteId`
-> EmotePay transfers USDC directly from viewer to creator with ERC-20 `transferFrom`
-> creator receives the exact USDC amount
-> EmotePay emits `Donation(donor, creator, amount, emoteId)` after successful USDC movement
-> OBS and Envio consume the event with `amount` interpreted as USDC base units
-> creator dashboard displays USDC-denominated totals and history.

## Proposed Reaction Pricing

The current product has four reaction tiers:

- Hype Fire
- To The Moon
- King/Queen
- Diamond Hands

Candidate demo USDC pricing:

- Hype Fire: `0.10 USDC`, base units `100000`
- To The Moon: `0.50 USDC`, base units `500000`
- King/Queen: `1.00 USDC`, base units `1000000`
- Diamond Hands: `2.50 USDC`, base units `2500000`

This preserves the existing 1:5:10:25 tier relationship. These MVP prices were explicitly approved with SPEC-008.

## Functional Requirements

### REQ-001

Native MON must no longer be accepted as the donation asset by the SPEC-008 contract.

### REQ-002

USDC must be the only supported donation token in SPEC-008.

### REQ-003

The USDC token address must be configured by trusted deployment logic, not supplied by frontend calls.

### REQ-004

The contract should configure the USDC token as an immutable constructor value unless implementation constraints reveal a reviewed reason to use another design.

### REQ-005

Constructor-based USDC configuration must reject the zero address.

### REQ-006

`donate(address creator, uint256 emoteId)` must remain the preferred external donation call shape unless implementation review identifies an incompatible blocker.

### REQ-007

The donation call must not accept an arbitrary frontend-supplied amount.

### REQ-008

The donation call must not accept a frontend-supplied token address.

### REQ-009

The contract must validate that `emoteId` is one of the supported reaction IDs.

### REQ-010

The contract must derive the exact USDC price from `emoteId`.

### REQ-011

The contract must transfer the exact derived USDC amount from donor to creator using standard ERC-20 `transferFrom` semantics.

### REQ-012

The payment must remain non-custodial: USDC must move directly from viewer to creator.

### REQ-013

The contract must not retain USDC after a successful donation.

### REQ-014

The contract must preserve the canonical `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)` event shape if feasible.

### REQ-015

If the canonical event shape is preserved, `Donation.amount` must be documented and handled as USDC base units instead of native MON wei.

### REQ-016

The frontend must check USDC balance before requesting a donation transaction.

### REQ-017

The frontend must check USDC allowance before requesting a donation transaction.

### REQ-018

When allowance is insufficient, the frontend should request an exact-amount approval for the selected reaction price for the MVP.

### REQ-019

The frontend must still check that the viewer has enough native MON to pay gas for approval and donation transactions.

### REQ-020

The frontend must wait for approval confirmation before calling `donate` when an approval is required.

### REQ-021

The frontend must wait for the donation receipt and only show success when the receipt status is successful.

### REQ-022

The USDC migration must deploy a new EmotePay contract on Monad Testnet instead of overwriting, pretending to upgrade, or replacing the historical MON deployment in place.

### REQ-023

OBS must update amount formatting and labels from MON wei to USDC base units.

### REQ-024

Envio and the creator dashboard must update amount semantics, formatting, labels, deployment address, and start block for the new USDC deployment.

### REQ-025

Historical V1 MON infrastructure must remain identifiable as historical MON infrastructure after the migration.

## Security Requirements

### SEC-001

A malicious or modified frontend must not be able to reduce the onchain price of a reaction.

### SEC-002

The frontend must not be trusted as the source of truth for reaction pricing.

### SEC-003

The contract must reject zero creator address.

### SEC-004

The contract must reject self-donation.

### SEC-005

The contract must reject invalid emote IDs.

### SEC-006

The contract must not use `tx.origin`.

### SEC-007

The contract must not add admin withdrawals.

### SEC-008

The contract must not add arbitrary token support.

### SEC-009

The contract must not add upgradeability as part of SPEC-008.

### SEC-010

The contract must not add protocol fees as part of SPEC-008.

### SEC-011

The donation function must be nonpayable or otherwise reject unexpected native MON value.

### SEC-012

ERC-20 transfer handling must not silently treat a failed transfer as successful.

### SEC-013

The implementation must evaluate the repository dependency situation before choosing OpenZeppelin `SafeERC20` or a local minimal safe-transfer helper.

### SEC-014

The frontend must not request unlimited USDC approval for the MVP unless the spec is revised and approved with a specific rationale.

### SEC-015

The UI must clearly distinguish USDC donation funds from native MON gas requirements.

### SEC-016

Deployment scripts must refuse unexpected chain IDs before deploying the USDC contract.

## Non-Functional Requirements

### NFR-001

The migration should fit the existing Next.js, React, Privy, viem, Hardhat, Solidity, OBS, and Envio stack.

### NFR-002

The primary viewer flow should remain understandable to non-Web3 users while preserving explicit payment consent.

### NFR-003

OBS must preserve creator filtering, transaction-hash plus log-index deduplication, sequential queueing, and realtime event-driven alerts.

### NFR-004

Envio must preserve stable donation identity using transaction hash and log index.

### NFR-005

The implementation must avoid unnecessary custody, storage, admin roles, and new infrastructure.

### NFR-006

The old MON deployment and indexed history must not be erased, overwritten, or misrepresented as USDC history.

## Out of Scope

- Gas sponsorship.
- Fiat on-ramp.
- Mercado Pago integration.
- Stablecoin swapping.
- Permit.
- Permit2.
- Account abstraction.
- EIP-7702.
- Multi-token payments.
- Creator registry redesign.
- Protocol fees.
- Upgradeable contracts.
- Frontend redesign beyond required USDC payment states.
- New OBS architecture.
- New Envio architecture beyond required migration changes.
- Mainnet deployment.
- Deploying or funding accounts during the DRAFT phase.

## Expected Files / Components

Expected eventual implementation may touch:

- `contracts/EmotePay.sol`
- `test/EmotePay.ts`
- new ERC-20 mock contract or test helper under `contracts/test/`
- `hardhat.config.ts` only if deployment/config support requires it
- `scripts/deploy-emotepay.ts`
- `scripts/check-monad-deployer.mjs`
- `scripts/generate-emotepay-abi.mjs`
- `lib/generated/emotePayAbi.ts`
- `lib/contracts.ts`
- `lib/emotes.ts`
- `lib/payment.ts`
- `lib/chains.ts` only if token metadata helpers are placed there
- `app/page.tsx`
- `app/overlay/page.tsx`
- `indexer/config.yaml`
- `indexer/schema.graphql` if asset metadata fields are added
- `indexer/src/handlers/donations.ts`
- `indexer/graphql/*.graphql` if query output changes
- `app/api/envio/route.ts` if API payload semantics or shape change
- `lib/envio.ts`
- `app/creator/page.tsx`
- `.env.example`
- `README.md` or project docs if migration instructions are added
- `docs/ARCHITECTURE.md` and `docs/PROJECT_STATUS.md` after implementation completion is approved

SPEC-008 DRAFT did not touch production code, contracts, env secrets, deployments, OBS, Envio, or frontend implementation. Implementation began only after explicit human approval.

## Acceptance Criteria

### AC-001

Given the SPEC-008 contract is deployed
When deployment uses a zero USDC token address
Then deployment reverts with an explicit error.

### AC-002

Given the SPEC-008 contract is deployed
When a viewer calls `donate` with native MON value
Then the transaction reverts or cannot be submitted because native MON is not accepted as the donation asset.

### AC-003

Given each valid emote ID
When `donate(creator, emoteId)` succeeds
Then the contract transfers exactly the contract-defined USDC base-unit price for that emote.

### AC-004

Given an invalid emote ID
When `donate(creator, emoteId)` is called
Then the call reverts with an expected error.

### AC-005

Given a zero creator address
When `donate` is called
Then the call reverts with an expected error.

### AC-006

Given the donor address equals the creator address
When `donate` is called
Then the call reverts with an expected error.

### AC-007

Given a successful donation
When balances are inspected
Then the viewer's USDC decreases by the exact emote price, the creator's USDC increases by the exact emote price, and the EmotePay contract's USDC balance remains zero.

### AC-008

Given insufficient USDC allowance
When `donate` is called
Then the call reverts or fails with the expected ERC-20 transfer failure.

### AC-009

Given insufficient viewer USDC balance
When `donate` is called
Then the call reverts or fails with the expected ERC-20 transfer failure.

### AC-010

Given a successful donation
When the event log is inspected
Then `Donation.donor`, `Donation.creator`, `Donation.amount`, and `Donation.emoteId` match the viewer, creator, exact USDC base-unit amount, and emote ID.

### AC-011

Given a compromised frontend
When it calls `donate` for a valid emote
Then it cannot supply a lower payment amount or alternate token.

### AC-012

Given the viewer has insufficient allowance
When the frontend prepares payment
Then it requests an exact-amount USDC approval and waits for approval confirmation before donation.

### AC-013

Given the viewer has sufficient allowance
When the frontend prepares payment
Then it does not request a redundant approval before donation.

### AC-014

Given the viewer lacks enough native MON for gas
When the frontend prepares approval or donation
Then the UI blocks or reports the gas issue without implying the viewer lacks USDC.

### AC-015

Given the donation receipt succeeds
When the frontend updates state
Then success is shown only after the successful receipt.

### AC-016

Given the donation receipt reverts or fails
When the frontend updates state
Then success is not shown and the viewer receives an understandable failure state.

### AC-017

Given OBS receives a SPEC-008 `Donation` event
When the event is for the configured creator
Then OBS displays the amount as USDC using 6 decimals and preserves deduplication and queue behavior.

### AC-018

Given OBS receives duplicate logs for the same transaction hash and log index
When logs are processed
Then only one alert is queued.

### AC-019

Given Envio processes a SPEC-008 `Donation` event
When it writes entities and aggregates
Then raw amount values are treated as USDC base units and displayed as USDC in downstream dashboard views.

### AC-020

Given the new USDC contract deployment is configured
When Envio starts indexing
Then it uses the new contract address and new deployment start block, not the historical MON deployment address or start block.

### AC-021

Given historical V1 MON information exists
When docs and configuration are reviewed after migration
Then the MON deployment remains distinguishable from the USDC deployment.

### AC-022

Given automated validation runs after implementation
When contract, frontend, and indexer checks complete
Then the required commands pass or any failures are documented for review.

## Automated Validation

Implementation must run:

- `npm run test:contracts`
- `npm run lint`
- `npm run build`
- `npm run indexer:codegen`
- `npm run indexer:typecheck`

Contract tests should use a deterministic mock ERC-20 for unit coverage. Live Monad Testnet USDC integration should be verified separately through manual or deployment verification, not as a hard dependency of deterministic unit tests.

## Manual Verification

- Verify the Circle USDC contract address and decimals before implementation starts if the address has changed since DRAFT.
- Deploy a new SPEC-008 EmotePay contract to Monad Testnet only after approval.
- Record deployment transaction, deployed address, and deployment block.
- Configure frontend, OBS, and Envio to the new USDC deployment.
- Acquire testnet USDC from Circle Faucet for a viewer wallet.
- Ensure the viewer also has native MON for gas.
- Send each approved reaction tier.
- Confirm exact USDC balance movement viewer -> creator.
- Confirm the EmotePay contract retains zero USDC after successful donations.
- Confirm OBS displays USDC alerts once per matching donation.
- Confirm Envio indexes the new donation events and creator dashboard totals display USDC.
- Confirm the historical V1 MON deployment remains untouched.

## Rollback / Failure Behavior

- If SPEC-008 implementation is not approved or fails verification, do not deploy or route users to the USDC contract.
- If the USDC deployment is faulty, stop using the new contract address in frontend, OBS, and Envio configuration.
- Do not mutate or overwrite the historical MON deployment.
- If Envio migration is faulty, preserve the old indexer configuration record and correct the new USDC indexer configuration before presenting USDC dashboard data.
- Failed or timed-out frontend transactions must not be blindly retried. The frontend must check transaction status before allowing a manual retry path.

## Dependencies

- Official Circle USDC on Monad Testnet.
- Circle Faucet for testnet USDC.
- Monad Testnet native MON for gas.
- Existing Privy authentication and embedded EVM wallet support.
- Existing Monad Testnet chain configuration.
- Existing Hardhat and viem tooling.
- Existing OBS event listener architecture.
- Existing Envio HyperIndex architecture.
- Human approval of proposed reaction pricing.
- Human approval before moving from REVIEW to APPROVED.

## Risks

- Event ABI shape can remain compatible while `amount` semantics change from MON wei to USDC base units; every consumer must be updated.
- 6-decimal USDC formatting mistakes could display or charge incorrect amounts.
- Exact-amount approvals are safer for MVP but add an extra transaction when allowance is missing.
- Approval confirmation and donation confirmation are separate asynchronous states that can fail independently.
- A frontend-only price table would be unsafe because modified clients could attempt cheaper payments.
- Envio aggregate counters remain incremental and are not made idempotent merely by deterministic donation IDs.
- The old MON deployment and new USDC deployment can be confused if configuration and docs are not explicit.
- Adding OpenZeppelin solely for `SafeERC20` may be heavier than the current dependency profile; a local minimal helper must still be reviewed carefully if chosen instead.

## Deployment Record

- Network: Monad Testnet, chain ID `10143`
- V2 contract: `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A`
- Deployment transaction: `0xc63c4745602340f4af758a3c1fa45bf5764e0445f93f43648d8e9f9684902ea5`
- Deployment block: `67874925`
- Constructor USDC token: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- Deployment status: `success`

Deployment observation:

The original deployment transaction broadcast succeeded, but the deployment script immediately attempted to fetch the transaction through the configured RPC and encountered `TransactionNotFoundError` because the RPC had not indexed the returned hash yet. The implementation hardened the deploy script to send only once and use bounded receipt polling. If the receipt is still not indexed before timeout, the script tells the operator to check transaction status before retrying and does not automatically rebroadcast.

## Open Questions

None for the approved MVP. The frontend reads the configured USDC token from the V2 contract, and deployment tooling passes the verified Monad Testnet USDC address to the constructor.

## Implementation Notes

- The preferred contract architecture is immutable `IERC20 public immutable usdc`.
- The preferred payment function is `donate(address creator, uint256 emoteId)` with no `payable` modifier and no amount argument.
- Suggested custom errors include `InvalidCreator`, `InvalidPaymentToken`, `InvalidEmote`, `SelfDonationNotAllowed`, and a transfer failure error if local safe-transfer logic is used.
- Approved price constants for verified 6-decimal USDC are `100000`, `500000`, `1000000`, and `2500000`.
- The event may preserve the existing ABI shape, but all docs and downstream formatting must state that `amount` is USDC base units for SPEC-008.
- The deployment script must pass the verified USDC address to the constructor and print the new contract address and block without printing secrets.

## Final Verification

REQ-001: PENDING
REQ-002: PENDING
REQ-003: PENDING
REQ-004: PENDING
REQ-005: PENDING
REQ-006: PENDING
REQ-007: PENDING
REQ-008: PENDING
REQ-009: PENDING
REQ-010: PENDING
REQ-011: PENDING
REQ-012: PENDING
REQ-013: PENDING
REQ-014: PENDING
REQ-015: PENDING
REQ-016: PENDING
REQ-017: PENDING
REQ-018: PENDING
REQ-019: PENDING
REQ-020: PENDING
REQ-021: PENDING
REQ-022: PENDING
REQ-023: PENDING
REQ-024: PENDING
REQ-025: PENDING
SEC-001: PENDING
SEC-002: PENDING
SEC-003: PENDING
SEC-004: PENDING
SEC-005: PENDING
SEC-006: PENDING
SEC-007: PENDING
SEC-008: PENDING
SEC-009: PENDING
SEC-010: PENDING
SEC-011: PENDING
SEC-012: PENDING
SEC-013: PENDING
SEC-014: PENDING
SEC-015: PENDING
SEC-016: PENDING
NFR-001: PENDING
NFR-002: PENDING
NFR-003: PENDING
NFR-004: PENDING
NFR-005: PENDING
NFR-006: PENDING
AC-001: PENDING
AC-002: PENDING
AC-003: PENDING
AC-004: PENDING
AC-005: PENDING
AC-006: PENDING
AC-007: PENDING
AC-008: PENDING
AC-009: PENDING
AC-010: PENDING
AC-011: PENDING
AC-012: PENDING
AC-013: PENDING
AC-014: PENDING
AC-015: PENDING
AC-016: PENDING
AC-017: PENDING
AC-018: PENDING
AC-019: PENDING
AC-020: PENDING
AC-021: PENDING
AC-022: PENDING

## Completion

Implementation commit: TBD
Review result: Architecture review passed; implementation review not started
Human approval: Granted for specification approval; completion approval TBD
