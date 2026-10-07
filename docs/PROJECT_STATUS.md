# EmotePay Project Status

This status reflects the verified repository state at documentation time.

## Phase 1 — Privy Authentication

Status: COMPLETE

Verified behavior:

- `PrivyProvider` is configured in `app/providers.tsx`.
- Login methods are Google and email.
- Embedded Ethereum wallets are created on login for users without wallets.
- `AuthButton` displays authenticated state and wallet address.

Relevant files:

- `app/providers.tsx`
- `components/AuthButton.tsx`
- `.env.example`

Validation/tests:

- Verified by code inspection.

Known limitations:

- Requires `NEXT_PUBLIC_PRIVY_APP_ID`.

## Phase 2 — Payment Domain

Status: COMPLETE

Verified behavior:

- Emote metadata is defined in `lib/emotes.ts`.
- Creator configuration is read from `NEXT_PUBLIC_CREATOR_WALLET_ADDRESS`.
- Current V3 contract configuration is read from `NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS` with no fallback to the historical V2 address.
- Payment readiness is centralized in `lib/payment.ts`.

Relevant files:

- `lib/emotes.ts`
- `lib/creator.ts`
- `lib/contracts.ts`
- `lib/payment.ts`
- `app/page.tsx`

Validation/tests:

- Verified by code inspection.

Known limitations:

- Creator is a single demo creator from environment configuration.
- Emote amounts are fixed in frontend metadata.

## Phase 3 — EmotePay Solidity Contract

Status: COMPLETE

Verified behavior:

- V3 `donateWithAuthorization(address donor, address creator, uint256 emoteId, uint256 validAfter, uint256 validBefore, bytes32 randomSalt, uint8 v, bytes32 r, bytes32 s)` accepts relayed EIP-3009 `receiveWithAuthorization` donations.
- V2 `donate(address creator, uint256 emoteId)` remains historical approve-then-donate infrastructure.
- USDC is configured immutably at deployment.
- `getEmotePrice(uint256 emoteId)` exposes contract-defined USDC prices.
- Zero creator address reverts with `InvalidCreator`.
- Zero donor address reverts with `InvalidDonor` in the V3 authorization path.
- Self-donation reverts with `SelfDonationNotAllowed`.
- Invalid emote IDs revert with `InvalidEmote`.
- Successful V3 donations receive exact USDC into EmotePay and atomically forward the same amount to the creator before emitting `Donation`.
- The V3 custody invariant is zero persistent custody: USDC balance after a successful donation must equal balance before.
- No donation history or custody storage is kept.

Relevant files:

- `contracts/EmotePay.sol`
- `contracts/test/MockUSDC.sol`
- `test/EmotePay.ts`
- `lib/generated/emotePayAbi.ts`

Validation/tests:

- `npm run test:contracts`

Known limitations:

- No platform fee, withdrawal, registry, or admin capability exists.

## Phase 4 — Monad Deployment / Real Payments

Status: COMPLETE

Verified behavior:

- Monad Testnet chain ID `10143` is defined in `lib/chains.ts`.
- Hardhat has a `monadTestnet` network.
- Deployment script refuses unexpected chain IDs.
- Frontend switches the embedded wallet to Monad Testnet before sending.
- Frontend reads the V3 contract's configured USDC token and exact reaction price.
- Frontend checks viewer USDC balance and signs one EIP-3009 `ReceiveWithAuthorization` typed-data payload.
- The relayer submits the V3 `donateWithAuthorization` transaction and sponsors Monad Testnet network gas in the MVP.
- The viewer does not need MON for donation gas in the V3 design.
- Envio configuration references deployed V3 contract `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4` from block `68828412`.

Relevant files:

- `lib/chains.ts`
- `app/page.tsx`
- `hardhat.config.ts`
- `scripts/deploy-emotepay.ts`
- `scripts/check-monad-deployer.mjs`
- `indexer/config.yaml`

Validation/tests:

- `npm run test:contracts`
- Manual Monad Testnet transaction verification.

Important public identifiers:

- Monad Testnet chain ID: `10143`
- Current V3 EmotePay contract: `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`
- Current V3 deployment transaction: `0x46b3c00d01c0111da5384351409b3265f26e10b6ddf199b720d993e1070bfd18`
- Current V3 Envio start block: `68828412`
- Current V3 USDC token: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- Historical V2 USDC contract: `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A`
- Historical V2 deployment transaction: `0xc63c4745602340f4af758a3c1fa45bf5764e0445f93f43648d8e9f9684902ea5`
- Historical V2 Envio start block: `67874925`
- Historical V1 MON contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Historical V1 start block: `66559947`

Known limitations:

- Frontend V3 contract address remains environment-driven through `NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS`.
- Real V3 smoke-test runtime evidence is still pending.
- Mainnet deployment is not configured or approved.

## Phase 5 — OBS Realtime Overlay

Status: COMPLETE

Verified behavior:

- `/overlay` renders a transparent OBS-compatible page.
- The overlay watches `Donation` events from the configured V3 contract.
- Logs are filtered to the configured creator.
- Alerts are deduplicated by transaction hash and log index.
- Unknown emote IDs are ignored.
- Alerts are queued and dismissed after a timed display.
- Amounts are formatted as 6-decimal USDC.

Relevant files:

- `app/overlay/page.tsx`
- `lib/chains.ts`
- `lib/contracts.ts`
- `lib/creator.ts`
- `lib/emotes.ts`

Validation/tests:

- Verified by code inspection.
- Manual validation requires configured env values and a live Monad Testnet donation.

Known limitations:

- Uses client-side event watching against the configured RPC.
- Does not persist OBS delivery state.

## Phase 6 — Envio + Creator Dashboard

Status: COMPLETE

Verified behavior:

- Envio indexes `Donation` events for Monad Testnet V3 contract `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`.
- Indexed entities include `Donation`, `Creator`, `CreatorDonor`, `Donor`, and `Emote`.
- Aggregates track total donations, total amount, unique donors, donor totals, and emote totals.
- `/api/envio` validates creator address and queries Envio GraphQL server-side.
- `/creator` displays USDC totals and recent indexed donations using 6-decimal formatting.

Relevant files:

- `indexer/config.yaml`
- `indexer/schema.graphql`
- `indexer/src/handlers/donations.ts`
- `indexer/graphql/creator-stats.graphql`
- `indexer/graphql/recent-donations.graphql`
- `indexer/graphql/top-supporters.graphql`
- `app/api/envio/route.ts`
- `lib/envio.ts`
- `app/creator/page.tsx`

Validation/tests:

- `npm run indexer:codegen`
- `npm run indexer:typecheck`
- Manual Envio GraphQL validation.

Important public identifiers:

- Monad Testnet chain ID: `10143`
- Indexed V3 EmotePay contract: `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`
- V3 start block: `68828412`
- Historical V2 EmotePay contract: `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A`
- Historical V2 start block: `67874925`
- Historical V1 MON contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Historical V1 start block: `66559947`

Known limitations:

- Requires `ENVIO_GRAPHQL_URL` and `ENVIO_GRAPHQL_ADMIN_SECRET` server-side.
- Does not index viewer messages.

## Next Prospective Spec

SPEC-007 — Alchemy Integration

Status: NOT CREATED
