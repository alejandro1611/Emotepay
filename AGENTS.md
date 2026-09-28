# EmotePay

EmotePay is a programmable social-payment layer built on Monad.

## Product vision

A user should be able to:

1. Sign in using Google or email.
2. Receive an embedded wallet automatically through Privy.
3. Select an emote associated with a payment.
4. Send the transaction through Monad.
5. Trigger a real-time visual event for the creator.
6. Store/index the donation for history and analytics.

Users should not need to understand:
- wallets
- seed phrases
- gas
- RPCs
- transaction hashes

The UX should feel like a Web2 payment application.

## Core stack

Frontend:
- React
- TypeScript/JavaScript

Blockchain:
- Monad
- Solidity

Authentication / wallet:
- Privy

RPC / blockchain data:
- Alchemy

Indexing:
- Envio

Streaming integration:
- OBS Browser Source
- WebSocket or SSE

## Development principles

- Do not rewrite working features unnecessarily.
- Inspect existing architecture before modifying code.
- Make small incremental changes.
- Do not expose private keys or API secrets.
- Environment variables must live in .env files.
- Never hardcode wallet private keys.
- Explain important architectural changes before implementing them.
- Run the relevant tests/build after modifications.

## Current priorities

1. Privy authentication.
2. Embedded wallet creation.
3. Emote payment transaction.
4. EmotePay smart contract.
5. Transaction confirmation.
6. OBS overlay.
7. Envio indexing.
8. Alchemy integration.
