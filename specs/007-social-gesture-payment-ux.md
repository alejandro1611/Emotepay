# SPEC-007 - Social Gesture Payment UX

## Status

APPROVED

## Approval Record

Architecture review: PASS
Architect recommendation: RECOMMEND APPROVAL
Human approval: Explicitly granted in conversation after architecture review
Implementation status: NOT STARTED

State history:

- DRAFT: Initial prospective specification drafted.
- REVIEW: Independent Architect reviewed the draft and recommended approval.
- APPROVED: Human approval explicitly granted after architecture review.

## Goal

Improve the viewer-facing payment experience so sending an EmotePay tip feels primarily like sending a social reaction, while preserving explicit payment consent and the existing Monad payment guarantees.

## Context

This is the first prospectively-created specification under the EmotePay SDD workflow.

EmotePay participates in the Metropolis Consumer Products & Payments track. The product direction is "Payments Embedded in Social Gestures": splitting a bill, sending a gift, or tipping a creator where the financial action feels like a message rather than a transaction.

The current repository already implements the core Web3 payment path:

viewer -> Privy authentication -> embedded EVM wallet -> Monad -> EmotePay Solidity contract -> creator receives MON -> Donation event -> realtime OBS overlay -> Envio creator analytics.

SPEC-007 does not redesign blockchain architecture. It defines a consumer UX improvement for the viewer-facing payment flow.

## Current State

The current viewer experience in `app/page.tsx` supports:

- Privy login with Google or email.
- Privy embedded EVM wallet detection.
- Fixed emote selection from `lib/emotes.ts`.
- Static demo creator configuration from `lib/creator.ts`, currently including a display name and wallet address.
- Creator address and contract address validation.
- Self-donation blocking.
- Monad Testnet switching.
- Balance check for donation value plus estimated gas.
- `donate(address,uint256)` transaction submission.
- Receipt confirmation before success.
- Local preview alert after confirmed payment.

The current UI exposes a working payment flow, but blockchain/payment mechanics can still compete with the primary consumer action of choosing and sending a reaction.

## Target Flow

viewer opens creator experience
-> understands who they are supporting
-> selects a reaction
-> understands the amount immediately
-> signs in if needed
-> sends reaction
-> sees simple payment progress
-> receives confirmed success or understandable failure
-> confirmed payment triggers the stream reaction

The viewer should not need to understand contract addresses, RPCs, ABI details, gas mechanics, chain IDs, or transaction internals unless they intentionally open technical details.

The interface must not hide the actual payment amount or remove information needed for informed payment consent.

On mobile, the intended hierarchy is creator or stream context -> reactions -> optional message -> send action.

## Functional Requirements

### REQ-001

The viewer-facing hierarchy must make selecting and sending a reaction the primary action.

### REQ-002

The viewer experience must show a clear consumer-facing creator identity, such as creator display name or handle and contextual status, before or near the reaction controls.

### REQ-003

The creator wallet address must not be the primary creator identity. Wallet or public address information may remain available only in secondary technical details.

### REQ-004

Blockchain mechanics such as contract address, RPC, ABI, chain ID, gas estimation, and transaction hash must not dominate the primary payment interface.

### REQ-005

Each reaction option must display the emoji or reaction visual, human-readable reaction name, MON payment amount, and selected state.

### REQ-006

The selected reaction and exact MON amount must be visible before the viewer submits payment.

### REQ-007

SPEC-007 must preserve the four current verified reaction amounts and improve presentation only.

### REQ-008

The UX must preserve Privy authentication with Google and email and keep login low-friction.

### REQ-009

Embedded wallet implementation details may be available in secondary UI, but they must not be required reading for the primary send flow.

### REQ-010

The payment flow must expose distinct viewer-facing states for ready, awaiting user approval, submitting, confirming, success, and failure.

### REQ-011

The send action must be disabled or otherwise guarded while a payment is in flight to prevent duplicate submissions.

### REQ-012

Successful payment feedback must communicate that the reaction was sent, the creator was supported, and confirmation completed.

### REQ-013

Advanced transaction details must use a secondary collapsible or disclosure pattern. They may expose network, transaction hash, explorer link, and wallet or contract details where relevant.

### REQ-014

Missing or invalid creator or contract configuration must show a clear unavailable state and must not expose a broken send flow.

## Security Requirements

### SEC-001

The UX must not change the recipient silently.

### SEC-002

The UX must not change the payment amount after the viewer approves or submits the payment.

### SEC-003

The UX must preserve the existing self-donation block.

### SEC-004

The OBS reaction must remain triggered only after confirmed payment.

### SEC-005

The UX must not blindly retry failed or timed-out payments.

### SEC-006

The UX must not hide the actual MON payment amount.

### SEC-007

The UX must not create a second payment path that bypasses `EmotePay.sol`.

### SEC-008

AI must not determine the payment recipient or payment amount.

### SEC-009

Raw technical errors must not be the primary user-facing error message.

## Non-Functional Requirements

### NFR-001

The primary viewer payment interaction must work well on desktop and common mobile viewports.

### NFR-002

The interface should optimize for "payment as social gesture" rather than "crypto transaction UI with an emote attached."

### NFR-003

Payment state copy should be understandable to non-Web3 users.

### NFR-004

The implementation should fit the existing Next.js, React, Privy, viem, and Framer Motion stack without new dependencies unless a later approved spec allows them.

### NFR-005

Fiat-equivalent display must not be introduced without separately approved price infrastructure.

## Out of Scope

- Alchemy integration.
- Gas sponsorship.
- Smart-account migration.
- EIP-7702 migration.
- USDC.
- Splits Protocol.
- Superfluid.
- New Solidity contracts.
- New contract logic.
- Contract upgrades.
- New indexing architecture.
- AI runtime features.
- OBS architecture rewrite.
- Creator analytics redesign.
- Standalone OBS layout redesign.
- Fiat conversion implementation.

## Expected Files / Components

Expected implementation may touch:

- `app/page.tsx`
- `components/AuthButton.tsx`
- `lib/payment.ts`
- `lib/emotes.ts`

Expected implementation must not touch unless a later approved spec changes scope:

- `contracts/`
- `hardhat.config.ts`
- `scripts/deploy-emotepay.ts`
- `app/overlay/page.tsx`
- `indexer/`
- dependency manifests

## Acceptance Criteria

### AC-001

Given the viewer opens the payment page on desktop  
When the page renders  
Then creator identity, reaction selection, and the send action are visually primary over blockchain implementation details.

### AC-002

Given the viewer opens the payment page on a common mobile viewport  
When the page renders  
Then creator or stream context appears before reaction controls, and the viewer can quickly select a reaction, see the exact MON amount, and reach the send action without layout overlap.

### AC-003

Given a reaction is selected  
When the viewer reviews the send action  
Then the selected reaction name and exact MON amount are visible before submission.

### AC-004

Given the creator identity is displayed  
When the primary payment flow is shown  
Then the creator display name, handle, or contextual identity is primary and the wallet address is not primary.

### AC-005

Given the viewer is not authenticated  
When they attempt to send a reaction  
Then the UI guides them through Privy login without presenting wallet internals as the primary task.

### AC-006

Given payment is awaiting approval, submitting, or confirming  
When the viewer tries to send again  
Then duplicate submission is prevented.

### AC-007

Given a payment receipt is confirmed successful  
When the success state renders  
Then the UI communicates that the reaction was sent, the creator was supported, and confirmation completed.

### AC-008

Given an insufficient balance, unavailable wallet, rejected transaction, reverted transaction, network problem, or invalid configuration  
When the error state renders  
Then the primary message is understandable to a non-Web3 user and does not rely on raw technical errors.

### AC-009

Given the viewer opens a secondary advanced-details disclosure after or around confirmation  
When transaction metadata is available  
Then network, transaction hash, explorer link, and relevant wallet or contract details may be shown as secondary details.

### AC-010

Given missing or invalid creator or contract configuration  
When the page renders  
Then sending is unavailable and a clear configuration state is shown.

### AC-011

Given the OBS overlay receives donation events  
When this UX spec is implemented  
Then OBS alert behavior remains triggered only by confirmed onchain donation events.

### AC-012

Given the four current verified reactions are displayed  
When the viewer reviews the options  
Then each reaction preserves its existing MON amount and clearly presents reaction, human-readable reaction name, and exact MON amount.

## Automated Validation

- `npm run lint`
- `npm run build`

No new automated validation tooling is required by this spec.

## Manual Verification

- Verify the viewer flow on desktop.
- Verify the viewer flow on a common mobile viewport.
- Verify unauthenticated login path still uses Privy Google/email.
- Verify selected reaction and exact MON amount are visible before payment submission.
- Verify duplicate send is prevented while payment is awaiting approval, submitting, or confirming.
- Verify success copy after confirmed receipt.
- Verify understandable messages for insufficient balance, wallet unavailable, rejected transaction, reverted transaction, network problem, and invalid configuration.
- Verify advanced transaction details are secondary when present.
- Verify OBS still reacts only after confirmed payment.

## Rollback / Failure Behavior

- If the UX change breaks payment submission, revert the viewer-facing UI changes while preserving the existing contract, payment, OBS, and Envio behavior.
- If a payment fails, the UI must return to a safe state where the viewer can understand the failure and choose whether to try again manually.
- Failed or timed-out payments must not be retried automatically without checking status first.

## Dependencies

- Existing Privy authentication and embedded EVM wallet setup.
- Existing Monad Testnet chain configuration.
- Existing `EmotePay.sol` contract and generated ABI.
- Existing fixed emote metadata and MON amounts.
- Existing receipt confirmation flow.
- Existing OBS overlay behavior.

## Open Questions

None at this draft stage.

## Implementation Notes

- Preserve the existing non-custodial payment path through `EmotePay.sol`.
- Preserve the current fixed emote amounts. Changing the actual amounts belongs to a separate approved change if needed later.
- Use existing static/demo creator configuration for creator identity unless a later approved spec introduces profile infrastructure.
- Use a secondary collapsible or disclosure pattern for technical transaction details; do not require a technical modal before every payment.
- Prefer clearer state naming and UI copy over new infrastructure.
- Do not introduce Alchemy, price APIs, gas sponsorship, new contracts, or new payment rails.
- Treat fiat-equivalent display as a possible future enhancement only.
- Keep technical details available for transparency but secondary to the social gesture.

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
SEC-001: PENDING
SEC-002: PENDING
SEC-003: PENDING
SEC-004: PENDING
SEC-005: PENDING
SEC-006: PENDING
SEC-007: PENDING
SEC-008: PENDING
SEC-009: PENDING
NFR-001: PENDING
NFR-002: PENDING
NFR-003: PENDING
NFR-004: PENDING
NFR-005: PENDING
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

## Completion

Implementation commit: TBD
Review result: Architecture review passed; implementation review not started
Human approval: Granted for specification approval; completion approval TBD
