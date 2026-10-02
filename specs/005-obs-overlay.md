# SPEC-005 — OBS Overlay

## Status

COMPLETE

## Documentation Note

This specification was documented retrospectively after implementation.

## Goal

Provide a transparent OBS browser-source overlay that shows realtime donation alerts from onchain EmotePay events.

## Context

Creators need a visual stream alert when a viewer sends a MON donation. The overlay should rely on canonical contract events rather than local viewer UI state.

## Current / Target Flow

OBS loads `/overlay`. The page watches `Donation` logs from the configured EmotePay contract on Monad Testnet, filters to the configured creator, deduplicates events, maps known emote IDs to display metadata, queues alerts, and animates them.

## Functional Requirements

### REQ-001

The overlay must render as a transparent full-screen browser-source page.

### REQ-002

The overlay must watch the configured EmotePay contract for `Donation` events.

### REQ-003

The overlay must filter events to the configured creator wallet address.

### REQ-004

The overlay must map known onchain emote IDs to local emote metadata.

### REQ-005

The overlay must queue and dismiss alerts rather than rendering all alerts at once.

## Security Requirements

### SEC-001

The overlay must not require or expose Privy authentication secrets.

### SEC-002

The overlay must deduplicate logs by transaction hash and log index to avoid duplicate alerts.

### SEC-003

Historical replay must not be treated as new live OBS alerts.

## Non-Functional Requirements

### NFR-001

The overlay should be suitable for OBS Browser Source use with transparent background styling.

### NFR-002

Missing contract or creator configuration should render a visible status message instead of failing silently.

## Out of Scope

- WebSocket server implementation.
- Persisted alert delivery state.
- Donation messages in the standalone overlay.
- Alchemy integration.

## Expected Files / Components

- `app/overlay/page.tsx`
- `app/providers.tsx`
- `lib/chains.ts`
- `lib/contracts.ts`
- `lib/creator.ts`
- `lib/emotes.ts`

## Acceptance Criteria

### AC-001

Given configured creator and contract addresses
When a matching `Donation` event is observed
Then the overlay displays the correct emote and amount.

### AC-002

Given duplicate logs for the same transaction hash and log index
When the overlay receives them
Then only one alert is queued.

### AC-003

Given missing overlay configuration
When `/overlay` renders
Then a visible configuration status is shown.

## Automated Validation

- Verified by code inspection.
- Frontend validation command: `npm run lint`.

## Manual Verification

- Add `/overlay` as an OBS Browser Source.
- Send a Monad Testnet donation to the configured creator.
- Confirm a single alert animates and then dismisses.

## Final Verification

REQ-001: PASS
REQ-002: PASS
REQ-003: PASS
REQ-004: PASS
REQ-005: PASS
SEC-001: PASS
SEC-002: PASS
SEC-003: PASS
NFR-001: PASS
NFR-002: PASS
AC-001: PASS
AC-002: PASS
AC-003: PASS

## Completion Note

The OBS overlay is implemented and documented as a retrospective SDD record.
