# Monad / EVM Engineering Rules

These are generic EVM and Monad rules. They do not override verified repository-specific decisions in `AGENTS.md`.

## Solidity / EVM

- Validate authorization explicitly.
- Never use `tx.origin` for authorization.
- Prefer custom errors where appropriate.
- Treat external calls as untrusted.
- Use checks-effects-interactions where relevant.
- Avoid unnecessary storage.
- Avoid unnecessary custody.
- Preserve explicit revert behavior.
- Verify value accounting.
- Emit events only after successful state or value changes.
- Avoid silent failure.
- Do not introduce unsafe `delegatecall` patterns unless explicitly designed and reviewed.

## Native Value Transfers

For EmotePay-like flows:

- Validate recipient addresses.
- Validate transferred amount.
- Handle call failure.
- Do not retain funds unless a spec explicitly requires custody.
- Avoid accidental self-payment.
- Verify contract balance assumptions.

## Client Transactions

- Verify chain ID before sending.
- Validate contract address.
- Validate recipient.
- Validate value.
- Confirm receipts.
- Do not blindly resend after timeout.
- Check transaction status first.
- Clearly distinguish testnet and mainnet.

## Secrets

- No private keys in source control.
- No private keys in `NEXT_PUBLIC_*` variables.
- No secrets in client bundles.
- No seed phrases.
- No deployer key logging.

## Indexing / Events

- Events are notifications and history inputs, not payment storage.
- Offchain indexing should be idempotent.
- Deduplicate events by transaction/log identity.
- Do not replay historical donations as new live OBS alerts.

## Product

- Keep payments non-custodial unless an approved spec changes the model.
- Do not create a platform token unless needed.
- Keep personal and private data offchain.
- AI must not decide recipient or payment amount.
