# EmotePay Envio HyperIndex

Indexes `Donation` events from the deployed `EmotePay` contract on Monad Testnet.

## Docs Used

- HyperIndex v3 docs, current as of 2026-09-29.
- Monad Testnet chain ID `10143` is listed as HyperSync-supported at `https://10143.hypersync.xyz`, so this config uses native HyperSync and does not require `MONAD_TESTNET_RPC_URL`.

## Contract

- Address: `0x039dd378eDD477aa7cd200953254a52D44f844A3`
- Start block: `66559947`
- Event: `Donation(address indexed donor, address indexed creator, uint256 amount, uint256 indexed emoteId)`

## Setup

```bash
cd indexer
pnpm install
cp .env.example .env
```

Set `ENVIO_API_TOKEN` in `indexer/.env`. HyperSync requires this token for local development and self-hosted runs. Envio Cloud supplies its own access for deployed indexers.

## Local Validation

Docker or Podman must be running for local Postgres and Hasura.

```bash
pnpm codegen
pnpm typecheck
pnpm dev
```

Local GraphQL is available through Hasura, typically at:

```text
http://localhost:8080/v1/graphql
```

The local Hasura admin secret is documented by Envio as `testing`.

## Known Donation To Verify

Query for transaction hash:

```text
0xec619cace36990e76c55e63bdb089210313d4603b45145258c436e3ea6ef6ffb
```

Expected:

- donor: `0x9e3481e9a3bd124906408d018773170e0e022280`
- creator: `0x27711734ac6865d99f9bbdcbae2730674275e749`
- amount: `1000000000000000`
- emoteId: `1`

## Cloud

Deploy after authenticating with Envio Cloud and connecting the repository. Do not commit real `.env` values.
