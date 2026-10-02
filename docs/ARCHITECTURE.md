# EmotePay Architecture

## Current

EmotePay is a Monad Testnet EVM application. The verified flow is:

viewer -> Privy login -> Privy embedded wallet -> `EmotePay.donate` transaction -> creator receives MON -> `Donation` event -> OBS overlay and Envio analytics.

## Viewer Frontend

The main viewer experience lives in `app/page.tsx`. It lets a viewer choose one of the fixed emotes from `lib/emotes.ts`, optionally type a local message, and submit a native MON donation.

The available emotes are:

- Hype Fire, onchain ID `1`, `0.001 MON`
- To The Moon, onchain ID `2`, `0.005 MON`
- King/Queen, onchain ID `3`, `0.01 MON`
- Diamond Hands, onchain ID `4`, `0.025 MON`

## Privy Authentication

`app/providers.tsx` wraps the app in `PrivyProvider` using `NEXT_PUBLIC_PRIVY_APP_ID`. Google and email login are enabled.

The overlay route can render without Privy if the Privy app ID is missing, because OBS does not need viewer authentication.

## Embedded EVM Wallet

Privy embedded Ethereum wallets are configured with:

`createOnLogin: "users-without-wallets"`

`components/AuthButton.tsx` displays authentication state and the embedded wallet address when available.

## Payment Flow

Payment readiness is modeled in `lib/payment.ts` and consumed by `app/page.tsx`.

Before sending a transaction, the frontend verifies:

- Privy is ready.
- The viewer is authenticated.
- Wallets are ready.
- A Privy embedded wallet exists.
- The creator wallet address is configured and valid.
- The EmotePay contract address is configured and valid.
- The viewer is not donating to themself.
- The wallet has enough MON for the donation value plus estimated gas.

The client switches the wallet to Monad Testnet chain ID `10143`, encodes `donate(address,uint256)`, sends native MON value to the contract, waits for the receipt, and treats non-success receipts as failures.

## EmotePay Solidity Contract

`contracts/EmotePay.sol` defines one payable function:

`donate(address creator, uint256 emoteId)`

The verified contract behavior is:

- Reverts for zero creator address.
- Reverts for zero-value donations.
- Reverts for self-donation.
- Forwards the full `msg.value` to the creator with `call`.
- Reverts if the external value transfer fails.
- Emits `Donation(donor, creator, amount, emoteId)` only after a successful transfer.
- Stores no donation history and keeps no custody balance in normal operation.

## Monad Testnet

`lib/chains.ts` defines Monad Testnet:

- Chain ID: `10143`
- Native currency: `MON`
- RPC URL: `https://testnet-rpc.monad.xyz`

`hardhat.config.ts` also defines a `monadTestnet` HTTP network using `MONAD_TESTNET_RPC_URL` and `DEPLOYER_PRIVATE_KEY`.

## Donation Event

The canonical event is:

`Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`

The generated frontend ABI in `lib/generated/emotePayAbi.ts` matches the contract artifact.

## OBS Realtime Path

`app/overlay/page.tsx` is the OBS browser-source route. It watches `Donation` events on the configured EmotePay contract address, filters logs to the configured creator address, deduplicates events by transaction hash and log index, maps `emoteId` to local emote metadata, queues alerts, and animates one alert at a time.

Historical events must not be replayed as new live alerts.

## Envio Indexing

The Envio HyperIndex project lives under `indexer/`.

Verified configuration:

- Package: `envio` `^3.12.1`
- Chain: Monad Testnet `10143`
- Contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Start block: `66559947`
- Event: `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`

`indexer/src/handlers/donations.ts` normalizes donor and creator addresses, creates donation IDs from transaction hash and log index, stores donation records, and updates creator, donor, creator-donor, and emote aggregates.

## `/api/envio` Bridge

`app/api/envio/route.ts` is a server-side bridge from the Next.js app to Envio GraphQL. It requires:

- `ENVIO_GRAPHQL_URL`
- `ENVIO_GRAPHQL_ADMIN_SECRET`

The route accepts a creator address and optional limit, validates the creator address, reads local GraphQL query files, queries creator stats and recent donations, and returns a `CreatorHistory` payload.

## Creator Dashboard

`app/creator/page.tsx` loads creator history through `lib/envio.ts` and `/api/envio`. It displays total received, donation count, unique donors, and recent donation rows with Monad explorer transaction links.

## Responsibility Boundaries

Onchain responsibilities:

- Validate basic donation constraints.
- Move MON from donor to creator.
- Emit canonical donation event.

Offchain responsibilities:

- Authentication.
- Embedded wallet creation.
- Creator and contract environment configuration.
- Emote metadata and fixed display amounts.
- Optional viewer message text.
- OBS alert rendering.
- Donation history indexing and analytics.

## Future

- Alchemy integration is not implemented.
- SPEC-007 has not been created.
- A future spec may define RPC provider abstraction, Alchemy APIs, or improved transaction/data reliability.
