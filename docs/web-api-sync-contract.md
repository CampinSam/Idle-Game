# Web/API sync contract

The NestJS API owns authoritative game state, rules, timers, and mutations. The React app renders the synced state; a visual countdown is not a command or a source of truth.

## Bootstrap and reads

After player authentication, `SyncEngine` calls the central client in `apps/web/src/services/api.ts` to fetch the bootstrap snapshot. The server assembles the player's current state and definition/catalog data; the client installs the snapshot into the Redux sync store, applies server time, and opens the event stream. Player features should read through sync selectors, not maintain parallel authoritative state or directly query the database.

## Commands and patches

Player writes use `useCommand` and `POST /v1/commands` with `{ type, payload, idempotencyKey }`. The API's command service resolves a handler, checks idempotency, locks the player, performs writes in a Prisma transaction, persists a delta, and responds with `{ patches, ui, cursor }`. Patches identify an entity and ID with `upsert` or `delete`; the web sync reducer applies them to its state. UI intents (such as toasts) are presentation instructions, not authoritative state. Every state change relevant to the client needs a corresponding patch; retries must reuse the same idempotency key for the same logical action.

## Streaming and recovery

`GET /v1/stream` is an SSE connection. The browser's `EventSource` passes the player token as a query parameter because it cannot set a bearer header; avoid logging or exposing stream URLs. `hello`/`ping` support connection health; `delta.available` signals that the client should fetch persisted deltas from its cursor rather than treating the event itself as the state update. Reconnect uses the cursor/last event ID to replay; if replay is not possible or `reset.required` arrives, the client bootstraps again. Broadcast events such as `tick.sync`, `home_banners.updated`, `global_power.changed`, and `boost.changed` update clock or targeted presentation/state concerns.

## Ownership of the boundary

`apps/web/src/services/api.ts` is the central HTTP adapter, and `SyncEngine` owns bootstrap, SSE, reconnect, and patch delivery. New feature code should use the adapter and selector/command hooks rather than adding raw fetches or inventing a second state channel. When a server shape changes, update the shared contract, API serializer/patch builder, client sync handling, tests, and admin schema/docs where applicable in the same reviewed change. Prefer additive compatible protocol changes for independently released web/API versions; coordinate breaking changes as a staged release.