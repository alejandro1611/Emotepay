# EmotePay Specifications

The `specs/` directory stores Spec-Driven Development records for EmotePay.

## Naming

Use:

`NNN-feature-name.md`

Example:

`007-alchemy-integration.md`

Do not create a spec after implementation begins unless the user explicitly asks for a retrospective record.

## Lifecycle

Prospective specs use:

`DRAFT` -> `REVIEW` -> `APPROVED` -> `IMPLEMENTING` -> `VERIFYING` -> `COMPLETE`

`BLOCKED` is allowed when progress cannot continue safely.

## Human Approval Gates

Human approval is required for:

- `REVIEW` -> `APPROVED`
- `VERIFYING` -> `COMPLETE`

Agents can recommend, but not approve, these transitions.

## Traceability

Use stable IDs:

- `REQ-xxx` for functional requirements.
- `SEC-xxx` for security requirements.
- `NFR-xxx` for non-functional requirements.
- `AC-xxx` for acceptance criteria.

The reviewer must produce a PASS/FAIL matrix for every `REQ`, `SEC`, `NFR`, and `AC`.

## Required Sections

Every spec must include an `Out of Scope` section. It must also define automated validation, manual verification when relevant, rollback/failure behavior, dependencies, open questions, final verification, and completion status.

## Change Control

Approved specs are immutable unless explicitly reopened. If an approved requirement must change, stop implementation and return the spec to review.

## Agent Flow

Spec -> Architect -> Human -> Implementer -> Reviewer -> Human.

- Architect is read-only.
- Implementer writes only the approved scope.
- Reviewer is read-only during review.
- User is final authority.

## Retrospective Specs

SPEC-001 through SPEC-006 are retrospective records. They document behavior already implemented before this SDD process existed.

Retrospective specs must say: "This specification was documented retrospectively after implementation."

They should derive requirements from verified repository behavior and must not invent historical requirements.

## Prospective Specs

The next spec must be created prospectively before implementation.

`SPEC-007 — Alchemy Integration`

Status: `NOT CREATED`
