# EmotePay Architecture

## Current

EmotePay is a Monad Testnet EVM application. The verified flow is:

viewer -> Privy login -> Privy embedded wallet -> EIP-3009 `ReceiveWithAuthorization` signature -> relayer submits `EmotePay.donateWithAuthorization` -> creator receives USDC -> `Donation` event -> OBS overlay and Envio analytics.

## Viewer Frontend

The main viewer experience lives in `app/page.tsx`. It lets a viewer choose one of the fixed emotes from `lib/emotes.ts`, optionally type a local message, and submit a USDC donation.

The available emotes are:

- Hype Fire, onchain ID `1`, `0.10 USDC`
- To The Moon, onchain ID `2`, `0.50 USDC`
- King/Queen, onchain ID `3`, `1.00 USDC`
- Diamond Hands, onchain ID `4`, `2.50 USDC`

## Privy Authentication

`app/providers.tsx` wraps the app in `PrivyProvider` using `NEXT_PUBLIC_PRIVY_APP_ID`. Google and email login are enabled.

The overlay route can render without Privy if the Privy app ID is missing, because OBS does not need viewer authentication.

## Embedded EVM Wallet

Privy embedded Ethereum wallets are configured with:

`createOnLogin: "users-without-wallets"`

`components/AuthButton.tsx` displays authentication state and the embedded wallet address when available.

## Payment Flow

Payment readiness is modeled in `lib/payment.ts` and consumed by `app/page.tsx`.

Before requesting a V3 authorization signature, the frontend verifies:

- Privy is ready.
- The viewer is authenticated.
- Wallets are ready.
- A Privy embedded wallet exists.
- The creator wallet address is configured and valid.
- The EmotePay contract address is configured and valid.
- The viewer is not donating to themself.
- The wallet has enough USDC for the donation amount.

The client switches the wallet to Monad Testnet chain ID `10143`, reads the configured USDC token and exact price from the V3 contract, generates a random salt, asks the embedded wallet to sign one EIP-3009 `ReceiveWithAuthorization` typed-data payload, sends the signed authorization to the relayer, waits for the relayed transaction receipt, and treats non-success receipts as failures. The viewer does not need MON for donation gas in the V3 design; the MVP relayer sponsors network gas.

## EmotePay Solidity Contract

`contracts/EmotePay.sol` defines the V3 relayed payment function:

`donateWithAuthorization(address donor, address creator, uint256 emoteId, uint256 validAfter, uint256 validBefore, bytes32 randomSalt, uint8 v, bytes32 r, bytes32 s)`

The current V3 contract behavior is:

- Reverts for zero creator address.
- Reverts for zero donor address in the authorization path.
- Reverts for self-donation.
- Reverts for invalid emote IDs.
- Derives the exact USDC price from `emoteId`.
- Recomputes a donation-bound EIP-3009 nonce from chain, contract, token, donor, creator, emote ID, exact price, and random salt.
- Calls USDC `receiveWithAuthorization` with EmotePay V3 as the signed payee.
- Atomically forwards the exact USDC amount from EmotePay to the creator.
- Emits `Donation(donor, creator, amount, emoteId)` only after a successful USDC transfer.
- Stores no donation history and keeps no custody balance in normal operation.
- Uses immutable deployment-controlled USDC configuration.
- Enforces zero persistent custody: the V3 USDC balance after a successful donation must equal the balance before the donation.

The previous V2 `donate(address creator, uint256 emoteId)` approve-then-donate flow remains historical infrastructure.

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

For V3, `amount` is USDC base units with 6 decimals.

## OBS Realtime Path

`app/overlay/page.tsx` is the OBS browser-source route. It watches `Donation` events on the configured EmotePay contract address, filters logs to the configured creator address, deduplicates events by transaction hash and log index, maps `emoteId` to local emote metadata, queues alerts, and animates one alert at a time.

Historical events must not be replayed as new live alerts.

## Envio Indexing

The Envio HyperIndex project lives under `indexer/`.

Current V3 configuration:

- Package: `envio` `^3.12.1`
- Chain: Monad Testnet `10143`
- Contract: `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`
- Start block: `68828412`
- Event: `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`
- Amount semantics: USDC base units, 6 decimals.

The V3 Envio dataset must not mix historical V1 MON or V2 USDC events.

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
- Determine reaction price from `emoteId`.
- Move USDC from donor to creator.
- Emit canonical donation event.

Offchain responsibilities:

- Authentication.
- Embedded wallet creation.
- Creator and contract environment configuration.
- Emote metadata and fixed display amounts.
- Optional viewer message text.
- OBS alert rendering.
- Donation history indexing and analytics.

## Historical V1 MON Deployment

The previous V1 native MON contract remains historical infrastructure:

- V1 MON contract: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- V1 Envio start block: `66559947`

The previous V2 USDC approve-then-donate deployment remains historical infrastructure:

- V2 USDC contract: `0x1dce4f6c02834907fb06B097bc62FC83e13ccF0A`
- V2 deployment transaction: `0xc63c4745602340f4af758a3c1fa45bf5764e0445f93f43648d8e9f9684902ea5`
- V2 start block: `67874925`
- USDC token: `0x534b2f3A21130d7a60830c2Df862319e593943A3`

The current V3 EIP-3009 receive-authorization deployment is:

- V3 contract: `0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`
- V3 deployment transaction: `0x46b3c00d01c0111da5384351409b3265f26e10b6ddf199b720d993e1070bfd18`
- V3 start block: `68828412`
- USDC token: `0x534b2f3A21130d7a60830c2Df862319e593943A3`

## Future

- Alchemy integration is not implemented.
- SPEC-007 has not been created.
- A future spec may define RPC provider abstraction, Alchemy APIs, or improved transaction/data reliability.
