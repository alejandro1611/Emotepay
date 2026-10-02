# SPEC-003 — EmotePay Solidity Contract

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Provide a minimal non-custodial Solidity contract that forwards native MON donations to creators and emits a canonical donation event.

## Context

The contract is the onchain payment boundary. It should move value and emit events without storing donation history or adding custody/admin complexity.

## Current / Target Flow

A donor calls `donate(address creator, uint256 emoteId)` with native value. The contract validates the donation, forwards the full value to the creator, reverts on transfer failure, and emits `Donation` after success.

## Functional Requirements

### REQ-001

The contract must expose `donate(address creator, uint256 emoteId)` as a payable function.

### REQ-002

The contract must forward the full `msg.value` to `creator`.

### REQ-003

The contract must emit `Donation(donor, creator, amount, emoteId)` after successful value transfer.

### REQ-004

The contract must not store donation history or retain funds in normal operation.

## Security Requirements

### SEC-001

The contract must revert when `creator` is the zero address.

### SEC-002

The contract must revert when `msg.value` is zero.

### SEC-003

The contract must revert self-donations.

### SEC-004

The contract must revert when native value forwarding fails.

### SEC-005

The contract must not use `tx.origin`.

## Non-Functional Requirements

### NFR-001

The contract should remain small and avoid unnecessary storage, custody, admin, or upgrade logic.

## Out of Scope

- Platform fees.
- Withdrawals.
- Admin roles.
- Upgradeability.
- Token payments.
- Onchain donation messages.
- Alchemy integration.

## Expected Files / Components

- `contracts/EmotePay.sol`
- `contracts/test/RevertingReceiver.sol`
- `test/EmotePay.ts`
- `lib/generated/emotePayAbi.ts`

## Acceptance Criteria

### AC-001

Given a valid donor, creator, emote ID, and nonzero value
When `donate` is called
Then the creator receives exactly the value and a `Donation` event is emitted.

### AC-002

Given zero value, zero creator, self-donation, or failed forwarding
When `donate` is called
Then the call reverts with the expected custom error.

### AC-003

Given a successful donation
When the transaction completes
Then the contract balance remains zero.

## Automated Validation

- `npm run test:contracts`

## Manual Verification

- Inspect deployed contract events on Monad Testnet when needed.

## Final Verification

REQ-001: PASS
REQ-002: PASS
REQ-003: PASS
REQ-004: PASS
SEC-001: PASS
SEC-002: PASS
SEC-003: PASS
SEC-004: PASS
SEC-005: PASS
NFR-001: PASS
AC-001: PASS
AC-002: PASS
AC-003: PASS

## Completion Note

The EmotePay contract is implemented and documented as a retrospective SDD record.
