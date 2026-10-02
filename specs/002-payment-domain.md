# SPEC-002 — Payment Domain

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Define the frontend payment domain for creator configuration, contract configuration, fixed emote amounts, and readiness states.

## Context

EmotePay lets viewers send expressive MON donations through predefined emotes. The frontend must know the creator address, contract address, emote metadata, and whether payment is currently safe to attempt.

## Current / Target Flow

The app reads creator and contract addresses from public environment variables, validates them with viem, exposes fixed emote options, and computes payment readiness before enabling the send action.

## Functional Requirements

### REQ-001

The app must define fixed emote metadata with frontend ID, onchain ID, emoji, name, display amount, MON amount, and styling.

### REQ-002

The creator wallet must be read from `NEXT_PUBLIC_CREATOR_WALLET_ADDRESS` and classified as ready, missing, or invalid.

### REQ-003

The EmotePay contract address must be read from `NEXT_PUBLIC_EMOTEPAY_CONTRACT_ADDRESS` and classified as ready, missing, or invalid.

### REQ-004

Payment readiness must block payment when auth, wallet, creator, contract, or self-donation checks fail.

## Security Requirements

### SEC-001

Recipient and contract addresses must be validated as EVM addresses before payment is enabled.

### SEC-002

Self-donation must be blocked in the frontend readiness state.

## Non-Functional Requirements

### NFR-001

Payment-domain checks must be centralized enough that UI components do not duplicate core readiness logic.

## Out of Scope

- Dynamic pricing.
- Creator registry.
- Fiat payments.
- Onchain message storage.
- Alchemy integration.

## Expected Files / Components

- `lib/emotes.ts`
- `lib/creator.ts`
- `lib/contracts.ts`
- `lib/payment.ts`
- `app/page.tsx`

## Acceptance Criteria

### AC-001

Given a missing creator wallet env value
When payment readiness is computed
Then payment is blocked with a creator configuration error.

### AC-002

Given an invalid contract address env value
When payment readiness is computed
Then payment is blocked with a contract configuration error.

### AC-003

Given the viewer wallet equals the creator wallet
When payment readiness is computed
Then payment is blocked as self-donation.

## Automated Validation

- Verified by code inspection.
- Frontend validation command: `npm run lint`.

## Manual Verification

- Toggle public env values between missing, invalid, and valid addresses.
- Confirm the send button stays disabled until configuration is valid.

## Final Verification

REQ-001: PASS
REQ-002: PASS
REQ-003: PASS
REQ-004: PASS
SEC-001: PASS
SEC-002: PASS
NFR-001: PASS
AC-001: PASS
AC-002: PASS
AC-003: PASS

## Completion Note

The payment domain is implemented and documented as a retrospective SDD record.
