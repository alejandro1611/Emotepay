# SPEC-006 — Envio Dashboard

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Index EmotePay donation events with Envio and expose creator donation analytics in the frontend dashboard.

## Context

The contract deliberately avoids onchain donation history storage. Historical views and analytics are offchain responsibilities fed by the canonical `Donation` event.

## Current / Target Flow

Envio indexes `Donation` events from the deployed EmotePay contract on Monad Testnet. The indexer stores donation records and aggregates. The Next.js app queries Envio GraphQL through a server-side `/api/envio` route, and `/creator` renders totals plus recent donation history.

## Functional Requirements

### REQ-001

The indexer must target Monad Testnet chain ID `10143`.

### REQ-002

The indexer must listen to the EmotePay `Donation` event.

### REQ-003

The indexer must store donation records with donor, creator, amount, emote ID, transaction hash, block number, log index, and timestamp.

### REQ-004

The indexer must update creator totals, donor totals, unique creator-donor records, and emote aggregates.

### REQ-005

The frontend must fetch creator history through `/api/envio`.

### REQ-006

The creator dashboard must display total received, donation count, unique donors, and recent donations.

## Security Requirements

### SEC-001

The `/api/envio` route must validate the requested creator address.

### SEC-002

Envio GraphQL URL and admin secret must be server-side environment variables and must not be exposed to the browser.

### SEC-003

Indexed donation entity IDs must be deterministic and stable using transaction hash and log index.

## Non-Functional Requirements

### NFR-001

Donation identity should be stable for individual indexed donations. Aggregate counters are updated incrementally by the current handler logic.

### NFR-002

The dashboard should handle loading, empty, unconfigured, and error states.

## Out of Scope

- Storing viewer messages.
- Replaying historical donations as live OBS alerts.
- Alchemy integration.
- Multi-creator management UI.

## Expected Files / Components

- `indexer/config.yaml`
- `indexer/schema.graphql`
- `indexer/src/handlers/donations.ts`
- `indexer/graphql/creator-stats.graphql`
- `indexer/graphql/recent-donations.graphql`
- `indexer/graphql/top-supporters.graphql`
- `app/api/envio/route.ts`
- `lib/envio.ts`
- `app/creator/page.tsx`

## Acceptance Criteria

### AC-001

Given a `Donation` event from the configured contract
When Envio processes it
Then it writes a stable `Donation` entity using transaction hash and log index, and updates the current aggregate entities incrementally.

### AC-002

Given a valid creator address and configured server Envio credentials
When `/api/envio` is called
Then it returns creator stats and recent donations.

### AC-003

Given indexed donations
When `/creator` loads
Then totals and recent donation rows are displayed.

## Automated Validation

- `npm run indexer:codegen`
- `npm run indexer:typecheck`
- Frontend validation command: `npm run lint`

## Manual Verification

- Run Envio locally or use configured Envio GraphQL.
- Query a known donation transaction through GraphQL.
- Open `/creator` with valid server env values.

## Known Limitation

Donation entities use a deterministic transactionHash-logIndex identity. This provides stable identity for individual indexed donations. Aggregate counters are updated incrementally and the current handler implementation does not independently guarantee idempotent aggregate mutation if the same event were processed more than once.

## Important Public Identifiers

- Indexed contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Start block: `66559947`
- Known verification transaction: `0xec619cace36990e76c55e63bdb089210313d4603b45145258c436e3ea6ef6ffb`

## Final Verification

REQ-001: PASS
REQ-002: PASS
REQ-003: PASS
REQ-004: PASS
REQ-005: PASS
REQ-006: PASS
SEC-001: PASS
SEC-002: PASS
SEC-003: PASS
NFR-001: PASS
NFR-002: PASS
AC-001: PASS
AC-002: PASS
AC-003: PASS

## Completion Note

Envio indexing and the creator dashboard are implemented and documented as a retrospective SDD record.
