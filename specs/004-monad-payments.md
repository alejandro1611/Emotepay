# SPEC-004 — Monad Payments

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Send real native MON donations on Monad Testnet through the deployed EmotePay contract.

## Context

After authentication, wallet provisioning, and contract creation, the frontend needs to create a real EVM transaction on Monad Testnet and confirm it before showing success.

## Current / Target Flow

The viewer selects an emote, the frontend verifies readiness and balance, switches the embedded wallet to Monad Testnet, sends a value-bearing contract call, waits for the receipt, and marks the donation successful only when the receipt status is success.

## Functional Requirements

### REQ-001

The app must define Monad Testnet with chain ID `10143` and native currency `MON`.

### REQ-002

The transaction must call the configured EmotePay contract address.

### REQ-003

The transaction must encode `donate(address,uint256)` with creator address and selected emote onchain ID.

### REQ-004

The transaction must include native MON value matching the selected emote amount.

### REQ-005

The UI must wait for a transaction receipt and only report success when `receipt.status` is `success`.

### REQ-006

Deployment tooling must refuse unexpected chain IDs before deploying to Monad Testnet.

## Security Requirements

### SEC-001

The frontend must validate creator and contract configuration before enabling payment.

### SEC-002

The frontend must check wallet balance for donation value plus estimated gas before submission.

### SEC-003

Deployment secrets must stay in env files and must not be committed or exposed as public frontend variables.

## Non-Functional Requirements

### NFR-001

Payment errors should be mapped to clear user-facing states.

## Out of Scope

- Mainnet deployment.
- Blind transaction retries.
- Alchemy integration.
- Faucet requests.
- Platform fees.

## Expected Files / Components

- `lib/chains.ts`
- `app/page.tsx`
- `hardhat.config.ts`
- `scripts/deploy-emotepay.ts`
- `scripts/check-monad-deployer.mjs`
- `.env.example`

## Acceptance Criteria

### AC-001

Given valid configuration and sufficient balance
When a viewer sends an emote payment
Then the client submits a Monad Testnet transaction to the EmotePay contract.

### AC-002

Given a submitted transaction
When the receipt succeeds
Then the UI reports donation success and stores the transaction hash as reference.

### AC-003

Given insufficient balance or reverted receipt
When the payment flow runs
Then the UI reports an error instead of success.

## Automated Validation

- `npm run test:contracts`
- Frontend validation command: `npm run lint`

## Manual Verification

- Configure Privy, creator wallet, contract address, and a funded Monad Testnet embedded wallet.
- Send each fixed emote amount.
- Confirm transaction success on Monad explorer.

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
AC-001: PASS
AC-002: PASS
AC-003: PASS

## Completion Note

Monad Testnet payments are implemented and documented as a retrospective SDD record.
