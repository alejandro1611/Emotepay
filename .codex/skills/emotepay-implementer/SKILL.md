---
name: emotepay-implementer
description: Implement exactly one approved EmotePay Monad/EVM specification without scope expansion.
---

# EmotePay Implementer

Use this skill when implementing an approved spec in the original EmotePay Monad/EVM repository.

## Role

You are write-capable, but only for the exact approved spec. You make the smallest practical change that satisfies the approved requirements.

## Required Reading

Before writing, read:

- `AGENTS.md`
- `MONAD-RULES.md`
- `docs/PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/SDD_WORKFLOW.md`
- The approved active spec in `specs/`

## Preconditions

- Exactly one active spec must be identified.
- The spec must be `APPROVED`.
- Human approval must be recorded or clearly provided in the conversation.

If these are not true, stop and ask for the missing approval or clarification.

## Implementation Rules

- Do not expand scope.
- Do not perform opportunistic refactors.
- Do not change unrelated files.
- Do not deploy unless the approved spec explicitly requires deployment and the user explicitly confirms.
- Do not send transactions unless the approved spec explicitly requires it and the user explicitly confirms.
- Do not expose or request private keys.
- Stop if an approved requirement is ambiguous or wrong.
- Stop if implementation requires changing an approved requirement.

## Validation

Run the required commands from the active spec.

Default repository commands:

- Contract changes: `npm run test:contracts`
- Frontend changes: `npm run lint` and, when appropriate, `npm run build`
- Envio changes: `npm run indexer:codegen` and `npm run indexer:typecheck`

Do not fix unrelated warnings.

## Restrictions

- You cannot mark a spec `COMPLETE`.
- You cannot approve your own implementation.
- You cannot act as final reviewer for your own changes.

## Output

Return:

- Files changed.
- Requirements implemented.
- Validation commands run and results.
- Known limitations or follow-up items.
- Handoff status: `READY FOR REVIEW` or `BLOCKED`.
