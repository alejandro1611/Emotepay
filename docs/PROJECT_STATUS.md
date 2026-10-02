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
- Contract configuration is read from `NEXT_PUBLIC_EMOTEPAY_CONTRACT_ADDRESS`.
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

- `donate(address creator, uint256 emoteId)` accepts native MON value.
- Zero creator address reverts with `InvalidCreator`.
- Zero-value donation reverts with `ZeroDonation`.
- Self-donation reverts with `SelfDonationNotAllowed`.
- Failed value forwarding reverts with `TransferFailed`.
- Successful donations forward the full amount and emit `Donation`.
- No donation history or custody storage is kept.

Relevant files:

- `contracts/EmotePay.sol`
- `contracts/test/RevertingReceiver.sol`
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
- Frontend estimates gas, checks balance, sends value to the configured contract, waits for a receipt, and handles reverted receipts.
- Envio configuration references deployed contract `0x039dd378eDD477aa7cd200953254a52D44f844A3`.

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
- Indexed EmotePay contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Envio start block: `66559947`

Known limitations:

- Frontend contract address remains environment-driven.
- Mainnet deployment is not configured or approved.

## Phase 5 — OBS Realtime Overlay

Status: COMPLETE

Verified behavior:

- `/overlay` renders a transparent OBS-compatible page.
- The overlay watches `Donation` events from the configured contract.
- Logs are filtered to the configured creator.
- Alerts are deduplicated by transaction hash and log index.
- Unknown emote IDs are ignored.
- Alerts are queued and dismissed after a timed display.

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

- Envio indexes `Donation` events for Monad Testnet contract `0x039dd378eDD477aa7cd200953254a52D44f844A3`.
- Indexed entities include `Donation`, `Creator`, `CreatorDonor`, `Donor`, and `Emote`.
- Aggregates track total donations, total amount, unique donors, donor totals, and emote totals.
- `/api/envio` validates creator address and queries Envio GraphQL server-side.
- `/creator` displays totals and recent indexed donations.

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
- Indexed EmotePay contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Start block: `66559947`

Known limitations:

- Requires `ENVIO_GRAPHQL_URL` and `ENVIO_GRAPHQL_ADMIN_SECRET` server-side.
- Does not index viewer messages.

## Next Prospective Spec

SPEC-007 — Alchemy Integration

Status: NOT CREATED
