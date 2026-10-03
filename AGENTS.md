# EmotePay Agents

## Project

This is the original EmotePay Monad/EVM repository for the Monad Metropolis hackathon.

The current verified product flow is:

viewer -> Privy authentication -> Privy embedded EVM wallet -> exact USDC approval when needed -> EmotePay Solidity contract -> creator receives USDC -> Donation event -> realtime OBS overlay -> Envio creator analytics.

This repository is not the Solana version of EmotePay. Do not apply Solana-specific rules unless the user explicitly asks for a Solana migration or comparison.

## Current Verified Stack

- Next.js `16.3.5`
- React `19.2.8`
- TypeScript `^5`
- Privy React Auth `^3.44.0`
- viem `^2.56.0`
- wagmi `^3.7.7`
- Solidity `0.8.28`
- Hardhat `^3.18.0`
- Monad Testnet, chain ID `10143`
- Envio HyperIndex `^3.12.1`
- Framer Motion `^13.4.0`
- Tailwind CSS `^4`
- Lucide React `^1.47.0`

## Current Implementation Status

### Verified / Complete

- Privy authentication is configured in `app/providers.tsx` with Google and email login methods.
- Privy embedded EVM wallets are configured with `createOnLogin: "users-without-wallets"`.
- The viewer payment UI in `app/page.tsx` selects fixed emotes from `lib/emotes.ts`.
- Payment readiness checks authentication, embedded wallet readiness, creator address configuration, contract address configuration, and self-donation.
- The client switches the embedded wallet to Monad Testnet chain ID `10143`.
- The client validates USDC balance, USDC allowance, and native MON gas readiness before submitting.
- The client reads the V2 contract's configured USDC token and exact reaction price.
- The client requests exact USDC approval when needed, waits for the approval receipt, sends a transaction to `EmotePay.donate(address,uint256)` with no native value, and waits for the donation receipt.
- The Solidity contract in `contracts/EmotePay.sol` is non-custodial and transfers exact USDC directly from viewer to creator.
- Contract tests in `test/EmotePay.ts` verify configured USDC, approved emote prices, event emission, exact forwarding, no retained USDC, invalid emote rejection, zero-address rejection, self-donation rejection, insufficient allowance, insufficient balance, and native MON rejection.
- The OBS overlay in `app/overlay/page.tsx` watches `Donation` events on Monad Testnet, filters to the configured creator, deduplicates by transaction hash and log index, and animates alerts.
- Envio indexes the deployed EmotePay V2 contract configured in `indexer/config.yaml` at `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A` from block `67874925`.
- The creator dashboard in `app/creator/page.tsx` reads donation history through `/api/envio`.
- The `/api/envio` route uses server-side `ENVIO_GRAPHQL_URL` and `ENVIO_GRAPHQL_ADMIN_SECRET` to query Envio GraphQL and does not expose those secrets to the browser.

### Not Implemented Yet / Future Work

- Alchemy integration is not implemented.
- The native MON deployment at `0x039dd378eDD477aa7cd200953254a52D44f844A3` from block `66559947` is historical V1 infrastructure.
- There is no platform custody, platform fee, creator registry, multi-creator routing UI, or admin contract logic.
- Donation messages are not stored onchain and are not indexed by Envio.
- The in-page stream preview uses local UI state after a confirmed transaction; the standalone OBS overlay uses onchain events.

## Instruction Precedence

Use this order when instructions conflict:

1. Explicit user task for the current phase.
2. `AGENTS.md`.
3. `docs/PROJECT_STATUS.md`.
4. `MONAD-RULES.md`.
5. Authoritative current documentation.
6. Model memory.

Project-specific verified decisions in this file override generic rules in `MONAD-RULES.md`.

## Smart Contract Rules

Preserve the verified EmotePay semantics unless an approved spec changes them:

- Payments are non-custodial.
- V2 payments use the immutable configured USDC token.
- The contract, not the frontend, determines reaction price from `emoteId`.
- The exact USDC amount is transferred directly from viewer to creator.
- Native MON is only used for gas unless a later approved spec changes that.
- Invalid emote IDs revert.
- Self-donations revert.
- `Donation` is emitted only after successful transfer.
- The contract does not keep unnecessary onchain history or storage.
- ERC-20 transfer failure reverts.
- Do not use `tx.origin`.
- Do not add unnecessary admin, custody, upgrade, fee, or withdrawal logic.

## Transactions

- Use Monad Testnet chain ID `10143` unless an approved spec says otherwise.
- Validate recipient addresses before sending transactions.
- Validate payment amount before sending transactions.
- Validate the configured contract address before sending transactions.
- Wait for transaction receipt confirmation and check `receipt.status`.
- Do not blindly retry after a timeout; check transaction status first.
- Do not deploy to mainnet unless explicitly approved by the user.

## Secrets

Never:

- Request or print private keys.
- Print deployer secrets.
- Commit `.env.local` or real `.env` files.
- Expose deployer keys in `NEXT_PUBLIC_*` variables.
- Expose server secrets to the browser.
- Commit secret indexer tokens.

## Testing

- Contract changes must run `npm run test:contracts`.
- Frontend changes should run the relevant verified commands from `package.json`, usually `npm run lint` and `npm run build`.
- Envio/indexer changes should run `npm run indexer:codegen` and `npm run indexer:typecheck` when relevant.
- Do not fix unrelated warnings unless the user asks.

## Spec-Driven Development

Allowed spec states:

- `DRAFT`
- `REVIEW`
- `APPROVED`
- `IMPLEMENTING`
- `VERIFYING`
- `COMPLETE`
- `BLOCKED`

Standard flow:

Spec -> Architect -> Human approval -> Implementer -> Reviewer -> Human approval -> Complete.

Human approval is required for:

- `REVIEW` -> `APPROVED`
- `VERIFYING` -> `COMPLETE`

Approved specs cannot silently change. If implementation reveals that an approved requirement must change, stop implementation and return the spec to review.

Traceability IDs:

- `REQ-xxx` for functional requirements.
- `SEC-xxx` for security requirements.
- `NFR-xxx` for non-functional requirements.
- `AC-xxx` for acceptance criteria.

Final review must produce PASS/FAIL for every `REQ`, `SEC`, `NFR`, and `AC`.

## Multi-Agent Orchestration

The main Codex agent acts as the orchestrator.

Flow:

Architect -> Human approval -> Implementer -> Reviewer -> Human approval -> Complete.

Rules:

- Architect is read-only.
- Implementer is the normal writer and works against exactly one approved spec.
- Reviewer is read-only during review.
- No parallel writes to the same files.
- Parallel read-only research is allowed.
- Agents cannot approve their own work.
- The user is the final authority.
