# Spec-Driven Development Workflow

## Lifecycle

Every prospective specification uses this lifecycle:

`DRAFT` -> `REVIEW` -> `APPROVED` -> `IMPLEMENTING` -> `VERIFYING` -> `COMPLETE`

`BLOCKED` is allowed when progress cannot continue without a decision, missing dependency, or external state change.

## Human Approval Gates

Human approval is required for:

- `REVIEW` -> `APPROVED`
- `VERIFYING` -> `COMPLETE`

Agents may recommend approval, but they cannot self-approve. Human approval is final.

## Versioning and Change Control

- Specifications are versioned project records.
- Approved specs cannot silently change.
- If implementation shows that an approved requirement must change, implementation stops and the spec returns to review.
- Changes to approved scope must be explicit and human-approved.

## Traceability IDs

- `REQ-xxx`: functional requirements.
- `SEC-xxx`: security requirements.
- `NFR-xxx`: non-functional requirements.
- `AC-xxx`: acceptance criteria.

Final reviewer output must include PASS/FAIL for every `REQ`, `SEC`, `NFR`, and `AC`.

## Standard Flow

1. Spec is drafted.
2. Architect reviews scope, architecture, risks, and acceptance criteria.
3. Human approves the spec.
4. Implementer makes the approved changes.
5. Reviewer compares the implementation, git diff, and tests against the spec.
6. Human approves completion.
7. Spec is marked `COMPLETE`.

## Agent Roles

- Architect: read-only; reviews specs and architecture.
- Implementer: write-capable; implements exactly one approved spec.
- Reviewer: read-only during review; reports PASS/FAIL and findings.
