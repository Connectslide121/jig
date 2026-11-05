# Teams relay — agent instructions

The bot's endpoint for Jig on your phone through Teams (D-370, phase 27): an Azure Function of the
user's own, deployed by Jig's setup from `dist/relay.zip`. Read `docs/plan/27-teams-phone.md` first.

- **Its own small package** (`@jig/teams-relay`, a workspace): TypeScript, Azure Functions v4 Node
  programming model, Node 22 on Flex Consumption. `npm run relay:build` (repository root) bundles
  `src/index.ts` with esbuild into one CommonJS file and zips it with `host.json` and a
  `package.json`; `npm run dist` builds it and the installer carries it in `resources/relay/`.
- **Plain `fetch` to Microsoft**, no Bot Framework SDK (archived, unsupported since 2025-12-31):
  `microsoft.ts` (app tokens from the bot's own tenant, Bot Connector, Graph channels),
  `botAuth.ts` (the incoming JWT, every check Microsoft's docs list). Keep them that way.
- **Endpoints live in `relay.ts`** (`createRelay`, no Azure imports, tested with `MemoryStore` and
  fakes); `index.ts` only registers them and reads the settings. `protocol.ts` is the contract with
  Jig: Jig imports its types only, so change both sides together and say so in the plan.
- **Credentials:** the bot's client secret only in the Function's settings, never sent anywhere
  but Entra's token endpoint, never returned or logged. The relay key is checked in constant time
  (`relayKey.ts`); every endpoint but `/api/messages` needs it, and `/api/messages` needs
  Microsoft's token.
- **Keep nothing it doesn't need:** only the paired account's activities (before pairing only a
  6-digit code), trimmed (`trimActivity`), deleted once Jig confirms them or after 24 h. Never log
  message text, cards or pictures.
- **Never create Azure resources or deploy from a coding chat.** Setup in Jig does that with the
  user's `az`, when the user presses Create.
