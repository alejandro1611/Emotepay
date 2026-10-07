# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Contexto adicional: `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`, `docs/SDD_WORKFLOW.md`, `specs/` (SPEC-001..007 y `TEMPLATE.md`), `MONAD-RULES.md`. El "Next.js 14" del README está desactualizado: las versiones de `AGENTS.md` son las válidas.

## Comandos

La raíz usa npm; `indexer/` es un paquete pnpm separado.

- `npm run dev` / `npm run build` / `npm run lint`
- `npm run test:contracts` — runner node:test de Hardhat 3 (tests en `test/*.ts`, con hardhat-viem y viem assertions). Compila los contratos automáticamente.
- Un solo archivo de test: `npx hardhat test nodejs test/EmotePay.ts`
- `npm run compile:contracts` y luego `npm run generate:abi` — regenera `lib/generated/emotePayAbi.ts` desde `artifacts/`. Nunca editar ese archivo a mano; ejecutarlo tras cualquier cambio de ABI.
- `npm run deploy:monad` (solo testnet; requiere `MONAD_TESTNET_RPC_URL` y `DEPLOYER_PRIVATE_KEY` en `.env.local`); `npm run check:monad-deployer` para verificar el deployer antes.
- `npm run indexer:codegen` / `indexer:typecheck` / `indexer:dev`

## Arquitectura transversal

- Variables de entorno: `.env.example` lista las principales. `hardhat.config.ts` carga `.env.local` vía `scripts/load-env-local.mjs`. El navegador lee `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_CREATOR_WALLET_ADDRESS`, `NEXT_PUBLIC_EMOTEPAY_CONTRACT_ADDRESS` y `NEXT_PUBLIC_KICK_CHANNEL` (opcional, embed del stream de Kick en `app/page.tsx`; no está en `.env.example`). `/api/envio` lee las variables solo-servidor `ENVIO_GRAPHQL_URL` y `ENVIO_GRAPHQL_ADMIN_SECRET`.
- Un solo creador: la dirección viene del env (`lib/creator.ts` → `demoCreator`), no de un registro onchain. `lib/contracts.ts` hace lo mismo con la dirección del contrato; ambos exponen un `configurationStatus` que `lib/payment.ts` usa para el readiness.
- Los IDs de `lib/emotes.ts` son el `emoteId` onchain; el overlay y los agregados por emote de Envio dependen de ellos. Mantenerlos estables.
- `lib/payment.ts` = modelo de readiness/validación; `app/page.tsx` = UI y envío de la tx; `lib/chains.ts` = definición de Monad Testnet; `lib/contracts.ts` = dirección y ABI.
- Cambiar la firma del evento `Donation` exige actualizar en cadena: contrato → regenerar ABI → overlay (`app/overlay/page.tsx`) → `indexer/config.yaml`, `indexer/schema.graphql`, `indexer/src/handlers/donations.ts`, `indexer/graphql/*.graphql` → `app/api/envio/route.ts` y `lib/envio.ts`. Un redeploy del contrato también implica actualizar dirección y start block en `indexer/config.yaml`.
- `/api/envio` lee el texto de las queries desde `indexer/graphql/*.graphql` en runtime (`readFile` con `process.cwd()`), así que esos archivos deben existir en el deploy del frontend.
- `contracts/test/RevertingReceiver.sol` es un helper solo para el test de fallo de reenvío.
- `app/providers.tsx` permite renderizar `/overlay` sin `NEXT_PUBLIC_PRIVY_APP_ID` (OBS no necesita auth); cualquier otra ruta lanza error si falta.
