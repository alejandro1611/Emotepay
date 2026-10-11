# EmotePay

EmotePay is a crypto donation experience for livestreamers, built for the **Monad Metropolis Hackathon 2026**. Viewers sign in with a familiar Google or email flow, receive a Privy embedded EVM wallet, fund it with test USDC, and send paid reactions that creators can show on stream through an OBS browser-source overlay.

## Live Demo & Technical Walkthrough

- **Live Application**: [https://emotepay.vercel.app](https://emotepay.vercel.app)
- **Technical Demo**: [Watch on YouTube](https://www.youtube.com/watch?v=vuWPQz-uv0Q)
## Why EmotePay

Livestream donations are usually split between two worlds:

- Web2 tipping tools are familiar, but payments are detached from onchain creator ownership.
- Web3 payments are programmable, but onboarding, gas, wallets, and transaction UX are still too heavy for casual viewers.

EmotePay connects the two. A viewer can log in without bringing a wallet, see their real USDC balance, choose a reaction, and authorize a donation. The creator receives USDC on Monad Testnet, a `Donation` event is emitted, the OBS overlay can animate the paid reaction, and Envio HyperIndex powers creator analytics.

## Implemented Highlights

- **Privy embedded wallets**: Google/email login with embedded EVM wallets created for users who do not already have one.
- **USDC donations on Monad Testnet**: Fixed reaction prices are denominated in USDC base units.
- **EIP-3009 authorization flow**: Viewers sign a `ReceiveWithAuthorization` typed-data payload instead of sending an approval transaction first.
- **Gas-sponsored relayer**: A server-side relayer submits `donateWithAuthorization` on Monad Testnet while protecting its private key and gas budget.
- **Replay and abuse protection**: The relayer uses Redis-backed coordination, rate limiting, nonce-aware deduplication, simulation, balance checks, and safe ambiguous-broadcast handling.
- **OBS browser-source overlay**: `/overlay` watches onchain `Donation` logs and renders animated paid reactions for livestream software.
- **Creator dashboard**: `/creator` is Privy-protected and reads indexed donation totals/history through a server-side Envio GraphQL proxy.
- **Kick stream support**: The main page can embed a Kick livestream or show an offline reaction demo.
- **Bilingual UI**: English and Spanish dictionaries with a compact language selector.

## Architecture

```mermaid
flowchart LR
  Viewer[Viewer] --> Login[Privy Google / Email Login]
  Login --> Wallet[Privy Embedded EVM Wallet]
  Wallet --> UI[EmotePay Viewer UI]
  UI --> Balance[Read USDC Balance on Monad Testnet]
  UI --> Sign[EIP-3009 ReceiveWithAuthorization Signature]
  Sign --> Relay[/api/relay-donation]
  Relay --> Redis[(Upstash Redis Rate Limits + Locks)]
  Relay --> RPC[Monad Testnet RPC]
  RPC --> Contract[EmotePay V3 Contract]
  Contract --> USDC[USDC Token]
  Contract --> Creator[Creator Wallet Receives USDC]
  Contract --> Event[Donation Event]
  Event --> Overlay[/overlay OBS Browser Source]
  Event --> Envio[Envio HyperIndex]
  Envio --> GraphQL[Envio GraphQL]
  GraphQL --> Api[/api/envio]
  Api --> Dashboard[/creator Dashboard]
```

## Payment Flow

1. The viewer signs in with Privy.
2. Privy provides an embedded EVM wallet.
3. The app switches the wallet to Monad Testnet (`10143`).
4. The app reads the configured EmotePay V3 contract and its USDC token.
5. The viewer selects a reaction with a fixed USDC price.
6. The viewer signs one EIP-3009 `ReceiveWithAuthorization` typed-data message.
7. `/api/relay-donation` validates the payload, donor balance, creator, chain, contract, nonce, signature, and simulated transaction.
8. The relayer submits `donateWithAuthorization`.
9. The contract receives USDC through `receiveWithAuthorization`, forwards the exact amount to the creator, and emits `Donation`.
10. OBS and Envio consume the same `Donation` event.

## Onchain Contract

Current Monad Testnet V3 deployment:

| Item | Value |
| --- | --- |
| Chain | Monad Testnet (`10143`) |
| EmotePay V3 | [`0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4`](https://testnet.monadexplorer.com/address/0x3AF2ADcF3e58a80710d406d0917b5f14FD78F9C4) |
| Deployment transaction | [`0x46b3c00d01c0111da5384351409b3265f26e10b6ddf199b720d993e1070bfd18`](https://testnet.monadexplorer.com/tx/0x46b3c00d01c0111da5384351409b3265f26e10b6ddf199b720d993e1070bfd18) |
| USDC token | [`0x534b2f3A21130d7a60830c2Df862319e593943A3`](https://testnet.monadexplorer.com/address/0x534b2f3A21130d7a60830c2Df862319e593943A3) |
| Envio start block | `68828412` |
| Donation event | `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)` |

The contract is non-custodial in normal operation: successful V3 donations move exact USDC from the donor to EmotePay and then to the creator within the same transaction. The contract checks that its USDC balance returns to the previous value before completing.

## Envio HyperIndex

The `indexer/` project indexes `Donation` events from the V3 contract on Monad Testnet.

Indexed entities:

- `Donation`: individual donation rows keyed by transaction hash and log index.
- `Creator`: total received, donation count, and unique donor count.
- `CreatorDonor`: creator/donor uniqueness tracking.
- `Donor`: donor aggregate totals.
- `Emote`: reaction usage and amount aggregates.

The Next.js app does not expose Envio credentials to the browser. `/api/envio` verifies the creator through Privy, validates the requested creator wallet, reads the GraphQL query files under `indexer/graphql/`, and queries the hosted Envio GraphQL endpoint server-side.

Public Envio Cloud GraphQL endpoints are supported through `ENVIO_GRAPHQL_URL`. Self-hosted or protected Hasura-style endpoints can additionally use `ENVIO_GRAPHQL_ADMIN_SECRET`.

## Technology Stack

Versions reflect the current repository configuration.

| Area | Technology |
| --- | --- |
| App framework | Next.js `16.3.5`, React `19.2.8`, TypeScript `^5` |
| Styling/UI | Tailwind CSS `^4`, Framer Motion `^13.4.0`, Lucide React `^1.47.0` |
| Auth/wallets | `@privy-io/react-auth` `^3.44.0`, `@privy-io/node` `^0.35.0` |
| EVM clients | viem `^2.56.0`, wagmi `^3.7.7` |
| Smart contracts | Solidity `0.8.28`, Hardhat `^3.18.0`, OpenZeppelin Contracts `5.6.1` |
| Relayer protection | Upstash Redis `^1.39.0`, Upstash Ratelimit `^2.2.0` |
| Indexing | Envio HyperIndex `^3.12.1` |
| Network | Monad Testnet, chain ID `10143` |
| Hosting target | Vercel for the Next.js app; Envio Cloud or local Docker for indexing |

## Repository Layout

```text
app/                    Next.js App Router pages and API routes
components/             Reusable UI components and modals
contracts/              Solidity EmotePay contract and test token
indexer/                Envio HyperIndex project
lib/                    Payment, Privy, chain, relayer, i18n, and Envio helpers
scripts/                Deployment and ABI generation scripts
test/                   Contract and TypeScript unit tests
```

Important routes:

- `/` - viewer donation experience
- `/login` - Privy login screen
- `/overlay` - OBS browser-source overlay
- `/creator` - creator analytics dashboard
- `/api/relay-donation` - gas-sponsored donation relayer
- `/api/envio` - creator-authorized Envio GraphQL proxy
- `/api/kick/status` - server-side Kick livestream status check

## Environment Variables

Never commit real `.env.local` values. Use `.env.example` as a starting point and configure production secrets in Vercel.

| Name | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Client/server | Privy app id |
| `PRIVY_APP_SECRET` | Server | Verifies creator dashboard access tokens |
| `NEXT_PUBLIC_CREATOR_WALLET_ADDRESS` | Client/server | Demo creator wallet allowed to receive sponsored donations |
| `NEXT_PUBLIC_EMOTEPAY_V3_CONTRACT_ADDRESS` | Client/server | Current EmotePay V3 contract |
| `NEXT_PUBLIC_EMOTEPAY_CONTRACT_ADDRESS` | Client/server | Historical V2 compatibility value |
| `MONAD_TESTNET_RPC_URL` | Server/build tooling | Monad RPC for Hardhat and server-side clients |
| `EMOTEPAY_RELAYER_PRIVATE_KEY` | Server | Relayer account that sponsors gas |
| `UPSTASH_REDIS_REST_URL` | Server | Redis REST endpoint for relayer coordination |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Redis REST token |
| `RELAY_IP_RATE_LIMIT` | Server | Per-IP relayer request limit |
| `RELAY_DONOR_RATE_LIMIT` | Server | Per-donor relayer request limit |
| `RELAY_RATE_LIMIT_WINDOW` | Server | Rate-limit window, for example `60 s` |
| `ENVIO_GRAPHQL_URL` | Server | Hosted Envio GraphQL endpoint |
| `ENVIO_GRAPHQL_ADMIN_SECRET` | Server, optional | Required only for protected/self-hosted GraphQL endpoints |
| `NEXT_PUBLIC_KICK_STREAM_MODE` | Client | `auto`, `live`, or `offline` |
| `NEXT_PUBLIC_KICK_CHANNEL` | Client/server | Kick channel slug |
| `KICK_CLIENT_ID` | Server | Kick API OAuth client id |
| `KICK_CLIENT_SECRET` | Server | Kick API OAuth client secret |
| `KICK_API_ACCESS_TOKEN` | Server, optional | Pre-generated Kick API token alternative |
| `DEPLOYER_PRIVATE_KEY` | Local deploy only | Hardhat deployment account |

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in the required values for the feature you are running. At minimum, the main app needs Privy, creator wallet, contract, RPC, relayer, and Redis configuration for the full donation flow.

Run the Next.js app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local Indexer Development

The production Next.js app should use a hosted Envio GraphQL endpoint. Local Envio development uses the separate `indexer/` project and Docker or Podman for Postgres/Hasura.

```bash
cd indexer
pnpm install
cp .env.example .env
pnpm codegen
pnpm typecheck
pnpm dev
```

Local GraphQL is typically available at:

```text
http://localhost:8080/v1/graphql
```

For local Hasura, the documented development admin secret is `testing`. Do not use that value in production.

## Validation Commands

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Additional indexer checks:

```bash
npm run indexer:codegen
npm run indexer:typecheck
```

If local Turbopack is blocked by sandbox restrictions, validate the production compile path with:

```bash
npx next build --webpack
```

## Production Deployment Notes

- Vercel hosts the Next.js app.
- Envio Cloud or an equivalent hosted GraphQL service should host the indexer.
- Docker is not required for Vercel production when using Envio Cloud.
- `ENVIO_GRAPHQL_URL` must point to the hosted HTTPS GraphQL endpoint, not `localhost`.
- Public Envio Cloud endpoints do not require `ENVIO_GRAPHQL_ADMIN_SECRET`; protected endpoints do.
- Keep `EMOTEPAY_RELAYER_PRIVATE_KEY`, `PRIVY_APP_SECRET`, Redis credentials, Kick secrets, and Envio secrets server-side only.

## Implemented vs. Planned

Implemented:

- Privy Google/email authentication.
- Privy embedded EVM wallets on Monad Testnet.
- Real USDC balance display.
- EIP-3009 `receiveWithAuthorization` donation flow.
- Gas-sponsored relayer with Redis coordination.
- EmotePay V3 contract and generated ABI.
- OBS overlay driven by onchain `Donation` events.
- Envio HyperIndex configuration and creator dashboard integration.
- Kick live/offline stream mode support.
- English/Spanish UI.

Not implemented or intentionally out of scope:

- Mainnet deployment.
- Platform fees, custody, withdrawals, admin controls, or creator registry.
- Multi-creator routing UI.
- Alchemy integration.
- Onchain or indexed viewer messages.

## Hackathon Context

EmotePay was developed for the Monad Metropolis Hackathon 2026, Consumer Products & Payments track.

## Team

- Alejandro Imanol Cruz - Project Lead & Developer
- Facundo Farfán - Team Member & Developer
- Andrés Chaile - Team Member & Developer
- Francisco Fernández - Team Member

## License

MIT License. See [LICENSE](./LICENSE).
