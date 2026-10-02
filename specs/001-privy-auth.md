# SPEC-001 — Privy Authentication

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Allow viewers to sign in with Google or email and receive a Privy embedded EVM wallet without managing seed phrases or external wallet setup.

## Context

EmotePay targets a Web2-like payment experience for creator tipping on Monad. Authentication and wallet provisioning are handled by Privy.

## Current / Target Flow

Viewer opens the app, logs in with Google or email, Privy creates or connects an embedded Ethereum wallet, and the UI displays wallet readiness.

## Functional Requirements

### REQ-001

The app must wrap frontend routes in `PrivyProvider` when `NEXT_PUBLIC_PRIVY_APP_ID` is configured.

### REQ-002

The app must support Google and email login methods.

### REQ-003

The app must request Privy embedded Ethereum wallet creation for users without wallets.

### REQ-004

The auth UI must display authenticated state and an available wallet address.

## Security Requirements

### SEC-001

The Privy app ID may be public, but private keys and wallet secrets must not be requested, printed, or committed.

### SEC-002

The OBS overlay must be able to render without requiring viewer authentication.

## Non-Functional Requirements

### NFR-001

Authentication should keep the user experience close to a normal Web2 login.

## Out of Scope

- External wallet-only onboarding.
- Seed phrase handling.
- Multi-tenant creator accounts.
- Alchemy integration.

## Expected Files / Components

- `app/providers.tsx`
- `components/AuthButton.tsx`
- `.env.example`

## Acceptance Criteria

### AC-001

Given `NEXT_PUBLIC_PRIVY_APP_ID` is configured
When the app renders
Then routes are wrapped in Privy authentication context.

### AC-002

Given an unauthenticated viewer
When they click login
Then Google and email login methods are offered.

### AC-003

Given an authenticated viewer without a wallet
When Privy completes login
Then an embedded Ethereum wallet is created or made available.

## Automated Validation

- Verified by code inspection.
- Frontend validation command: `npm run lint`.

## Manual Verification

- Configure `NEXT_PUBLIC_PRIVY_APP_ID`.
- Start the app.
- Log in with Google or email.
- Confirm the UI shows authenticated state and a wallet address.

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

Privy authentication is implemented and documented as a retrospective SDD record.
