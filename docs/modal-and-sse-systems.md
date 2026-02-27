# Server-Driven Modal System & Command/Delta/SSE Pipeline

This document covers the two major client-server communication systems in Derp Universe: the **Server-Driven Modal System** for displaying rich UI modals, and the **Command/Delta/SSE Pipeline** for real-time state synchronization.

---

## Table of Contents

1. [Server-Driven Modal System (ModalSpecV1)](#server-driven-modal-system)
   - [Overview](#modal-overview)
   - [ModalSpecV1 Structure](#modalspecv1-structure)
   - [Block Types](#block-types)
   - [Action Types](#action-types)
   - [Backend: Constructing Modals](#backend-constructing-modals)
   - [Frontend: Rendering & Handling](#frontend-rendering--handling)
   - [How to Add a New Modal](#how-to-add-a-new-modal)
   - [How to Add a New Block Type](#how-to-add-a-new-block-type)
   - [How to Add a New Action Type](#how-to-add-a-new-action-type)
2. [Command/Delta/SSE Pipeline](#commanddeltasse-pipeline)
   - [Overview](#pipeline-overview)
   - [Architecture Diagram](#architecture-diagram)
   - [Bootstrap Flow](#bootstrap-flow)
   - [Command Execution](#command-execution)
   - [Delta Persistence & Patches](#delta-persistence--patches)
   - [SSE Streaming](#sse-streaming)
   - [Client-Side Sync Engine](#client-side-sync-engine)
   - [useCommand Hook](#usecommand-hook)
   - [Reconnection & Error Handling](#reconnection--error-handling)
   - [How to Add a New Command](#how-to-add-a-new-command)
   - [Transaction Safety Rules](#transaction-safety-rules)

---

## Server-Driven Modal System

### Modal Overview

The modal system is **server-authoritative**: the backend constructs a declarative spec (`ModalSpecV1`) describing the modal's content and actions, and the frontend renders it without needing to know the business logic. This decouples game logic from UI and lets the server control what the player sees.

**Key components:**
| Layer | File | Role |
|-------|------|------|
| Shared types | `packages/shared/src/types/modal.ts` | TypeScript interfaces for all modal types |
| Backend builder | `apps/api/src/modules/ui/ui.service.ts` | Constructs `ModalSpecV1` objects |
| Backend endpoint | `apps/api/src/modules/ui/ui.controller.ts` | `GET /ui/modal` serves modal specs |
| Frontend renderer | `apps/web/src/components/modal/GameModal.tsx` | Renders the modal chrome (header, buttons, dismiss) |
| Frontend host | `apps/web/src/components/modal/GameModalHost.tsx` | Handles actions, manages modal lifecycle |
| Frontend context | `apps/web/src/context/ModalContext.tsx` | Modal queue (push, replace, dismiss) |
| Block renderers | `apps/web/src/components/modal/blocks/` | One component per block type |

### ModalSpecV1 Structure

```typescript
interface ModalSpecV1 {
  version: 1;
  id: string;                    // Unique modal ID (e.g., "job_abc123")
  kind: string;                  // Category: 'notification', 'gift', 'job_result', etc.
  dismiss: {
    backdrop: boolean;           // Can dismiss by clicking backdrop
    x: boolean;                  // Show X close button
    escape: boolean;             // Can dismiss with Escape key
  };
  header: {
    title: string;
    subtitle?: string;
    icon?: AssetRef;             // { assetKey: string, alt?: string }
    banner?: AssetRef;
  };
  body: ModalBlock[];            // Array of content blocks (see below)
  buttons: ModalButton[];        // Array of action buttons (see below)
  telemetry?: ModalTelemetry;    // Optional tracking metadata
}
```

**Buttons:**
```typescript
interface ModalButton {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  action: ModalAction;           // What happens when clicked
  requiresConfirm?: {            // Optional confirmation dialog
    title: string;
    body: RichTextDoc;
    confirmLabel?: string;
    cancelLabel?: string;
  };
}
```

### Block Types

Each block type maps to a React component in `apps/web/src/components/modal/blocks/`.

All block types are rendered through `BlockRenderer.tsx` (`apps/web/src/components/modal/blocks/BlockRenderer.tsx`), which switches on `block.type` and delegates to the appropriate component.

| Type | Interface | Description | Renderer Component |
|------|-----------|-------------|-------------------|
| `richText` | `{ type: 'richText', doc: RichTextDoc }` | Formatted text with headings, lists, links | `RichText.tsx` |
| `divider` | `{ type: 'divider' }` | Horizontal rule separator | `BlockRenderer` (inline) |
| `image` | `{ type: 'image', image: AssetRef, caption?: string }` | Image from asset storage | `BlockRenderer` (uses `AssetImage`) |
| `metaRows` | `{ type: 'metaRows', rows: { label, value }[] }` | Key-value info display | `MetaRowsBlock.tsx` |
| `timer` | `{ type: 'timer', endsAt: string, label?: string }` | Live countdown timer | `TimerBlock.tsx` |
| `progress` | `{ type: 'progress', current: number, max: number, label?: string }` | Progress bar | `ProgressBlock.tsx` |
| `rewardsPreview` | `{ type: 'rewardsPreview', items: RewardItem[] }` | Compact reward display | `RewardsListBlock.tsx` |
| `rewardsList` | `{ type: 'rewardsList', title?: string, items: RewardItem[] }` | Full reward list with rarity | `RewardsListBlock.tsx` |
| `inventoryDelta` | `{ type: 'inventoryDelta', items: { assetKey?, name, qtyDelta }[] }` | Inventory change summary | `InventoryDeltaBlock.tsx` |
| `giftReveal` | `{ type: 'giftReveal', gift: { giftId, title, image? }, rewards?: RewardItem[] }` | Gift opening animation | `GiftRevealBlock.tsx` |
| `error` | `{ type: 'error', message: string }` | Error message display | `BlockRenderer` (inline) |

**RichTextDoc format:**
```typescript
type RichTextDoc = RichTextNode[];
type RichTextNode =
  | { t: 'p' | 'h1' | 'h2' | 'ul' | 'li' | 'strong' | 'em' | 'code'; c: RichTextNode[] }
  | { t: 'link'; c: RichTextNode[]; href: string }
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'token'; key: string };  // Dynamic placeholder
```

**RewardItem format:**
```typescript
interface RewardItem {
  assetKey?: string;   // Asset storage key for icon
  name: string;
  qty?: number;
  rarity?: string;     // COMMON, UNCOMMON, RARE, EPIC, LEGENDARY
  note?: string;
}
```

### Action Types

Actions are triggered by button clicks and handled by `GameModalHost.handleAction()`.

| Action Type | Payload | Behavior |
|-------------|---------|----------|
| `CLOSE_MODAL` | (none) | Dismisses the current modal |
| `NAVIGATE` | `{ route: string, params?: Record }` | Navigate to a route, then dismiss |
| `OPEN_INVENTORY` | (none) | Navigate to `/inventory` |
| `OPEN_MISSIONS` | (none) | Navigate to `/missions` |
| `OPEN_CRAFTING` | (none) | Navigate to `/crafting` |
| `ACK_NOTIFICATION` | `{ notificationId: string }` | Mark notification as read, dismiss |
| `COMPLETE_JOB` | `{ jobId: string }` | Complete the job via command pipeline, then fetch follow-up modal |
| `CLAIM_GIFT` | `{ giftId: string }` | Claim gift via REST, refresh state, fetch follow-up modal |
| `REPEAT_MISSION` | `{ defId: string, entityIds: string[] }` | Re-send the same mission with the same team via command pipeline; falls back to navigating to `/missions` if the command fails |
| `CRAFT_AGAIN` | `{ recipeDefId: string }` | Navigate to `/crafting` (payload fields are available for future use but currently ignored by frontend) |
| `API_CALL` | `{ apiKey: string, payload?: Record }` | Execute a named API call (e.g., `jobs.skip`) |

**Follow-up modals:** After `COMPLETE_JOB` and `CLAIM_GIFT`, the host calls `tryFetchFollowUp()` which requests a new modal from `GET /ui/modal`. If the server returns one, it replaces the current modal (e.g., showing rewards after completing a job).

### Backend: Constructing Modals

Modals are built by `UiService` in `apps/api/src/modules/ui/ui.service.ts`.

The `GET /ui/modal` endpoint accepts query parameters to determine which modal to build:
- `?jobId=<id>` — builds a job status/result modal
- `?notificationId=<id>` — builds a notification detail modal
- `?giftId=<id>` — builds a gift claim/reveal modal

**Example: building a completed job modal (simplified):**
```typescript
async buildCompletedJobModal(job, defName, typeLabel, results) {
  const body: ModalBlock[] = [];
  const buttons: ModalButton[] = [];

  // Add reward blocks if results exist
  if (results?.rewards?.length > 0) {
    body.push({ type: 'rewardsList', title: 'Rewards', items: results.rewards });
  }

  // Add navigation button
  buttons.push({
    id: 'close',
    label: 'Done',
    variant: 'primary',
    action: { type: 'CLOSE_MODAL' },
  });

  return {
    version: 1,
    id: `job_${job.id}`,
    kind: 'job_result',
    dismiss: { backdrop: true, x: true, escape: true },
    header: { title: `${typeLabel} Complete`, subtitle: defName },
    body,
    buttons,
  };
}
```

### Frontend: Rendering & Handling

**Modal queue** (`ModalContext`):
```typescript
pushModal(spec)     // Add modal to queue
replaceModal(spec)  // Replace current modal (used for follow-ups)
dismissModal()      // Remove current modal, show next in queue
```

**Rendering chain:**
1. Any call site (toast click, notification tap, mission complete) calls `pushModal(spec)`.
2. `GameModalHost` reads `currentModal` from `ModalContext`.
3. `GameModal` renders the header, body blocks (via `BlockRenderer`), and buttons.
4. When a button is clicked, `GameModal` calls `onAction(button.action)`.
5. `GameModalHost.handleAction()` processes the action (navigate, API call, command, etc.).

**Fetching a modal from the server:**
```typescript
const spec = await api.getModalSpec({ jobId: 'abc123' });
if (spec?.version === 1) {
  pushModal(spec);
}
```

### How to Add a New Modal

1. **Add a builder method** to `UiService` (e.g., `buildModalForAuction()`).
2. **Construct a `ModalSpecV1`** with appropriate header, body blocks, and buttons.
3. **Add a query parameter** to the `GET /ui/modal` endpoint if needed.
4. **Trigger it** from the frontend by calling `api.getModalSpec({ auctionId })` and `pushModal(spec)`, or return it as a `UiIntent` from a command handler.

### How to Add a New Block Type

1. **Define the interface** in `packages/shared/src/types/modal.ts`:
   ```typescript
   export interface ModalBlockMyNew { type: 'myNew'; data: string; }
   ```
2. **Add it to the `ModalBlock` union** in the same file.
3. **Add `'myNew'` to `MODAL_BLOCK_TYPES`** array.
4. **Create a renderer** at `apps/web/src/components/modal/blocks/MyNewBlock.tsx`.
5. **Register it** in `BlockRenderer.tsx`:
   ```typescript
   case 'myNew':
     return <MyNewBlock data={block.data} />;
   ```
6. **Rebuild the shared package**: `pnpm --filter @derp/shared build`.

### How to Add a New Action Type

1. **Add the type** to the `ModalAction` union in `packages/shared/src/types/modal.ts`:
   ```typescript
   | { type: 'MY_ACTION'; myParam: string }
   ```
2. **Add `'MY_ACTION'` to `MODAL_ACTION_TYPES`** array.
3. **Handle it** in `GameModalHost.tsx`:
   ```typescript
   case 'MY_ACTION': {
     // perform the action
     dismissModal();
     return;
   }
   ```
4. **Rebuild the shared package**: `pnpm --filter @derp/shared build`.

---

## Command/Delta/SSE Pipeline

### Pipeline Overview

All player write operations go through a single endpoint (`POST /v1/commands`). The pipeline guarantees:
- **Atomicity**: Each command runs in a Serializable database transaction.
- **Idempotency**: Duplicate requests return cached results.
- **Per-player locking**: Prevents concurrent commands for the same player.
- **Real-time sync**: After commit, SSE notifies the client to fetch new deltas.

### Architecture Diagram

```
┌─────────────┐         POST /v1/commands         ┌──────────────────┐
│  Frontend    │ ──────────────────────────────────►│  CommandController│
│  useCommand  │                                    └────────┬─────────┘
└──────┬──────┘                                              │
       │                                              CommandService
       │                                     ┌───────────────┼───────────────┐
       │                                     │  $transaction (Serializable)  │
       │                                     │                               │
       │                                     │  1. Idempotency check         │
       │                                     │  2. Player lock (FOR UPDATE)  │
       │                                     │  3. Handler.execute()         │
       │                                     │  4. Persist PlayerDelta       │
       │                                     │  5. Store idempotency key     │
       │                                     └───────────────┬───────────────┘
       │                                                     │
       │                                              PubSub.publish()
       │          ┌──────────────────────────────────────────┘
       │          │
       │    ┌─────▼──────┐       SSE delta.available      ┌──────────────┐
       │    │ StreamCtrl  │ ─────────────────────────────► │  SyncEngine  │
       │    │ /v1/stream  │                                └──────┬───────┘
       │    └─────────────┘                                       │
       │                            GET /v1/delta?since=cursor    │
       │◄─────────────────────────────────────────────────────────┘
       │                                                     applyPatches
       │                                                          │
  ┌────▼────┐                                              ┌──────▼──────┐
  │ Command │  patches + ui intents (immediate response)   │  syncSlice  │
  │ Response│ ─────────────────────────────────────────────►│  (Redux)    │
  └─────────┘                                              └─────────────┘
```

### Bootstrap Flow

When a user logs in, `SyncEngine.start()` runs:

1. **`GET /v1/bootstrap`** fetches the full player snapshot:
   - Player profile, entities, locations, buildings, rooms
   - Inventory items, jobs, notifications, currency balances
   - Latest delta cursor (for subsequent incremental updates)

2. **`setSnapshot(response)`** populates `syncSlice` entity tables.

3. **`openStream()`** opens an SSE connection for real-time push.

**Server-side** (`QueryService.bootstrap()`):
- Runs parallel Prisma queries for all entity types.
- Returns data keyed by entity type with the latest `PlayerDelta` ID as the cursor.

### Command Execution

**Client sends:**
```typescript
const { execute } = useCommand();
await execute('StartMission', { defId: 'scout_01', entityIds: ['entity_1'] });
```

**Wire format:**
```json
{
  "type": "StartMission",
  "payload": { "defId": "scout_01", "entityIds": ["entity_1"] },
  "idempotencyKey": "StartMission-1708400000000-1"
}
```

**Server pipeline** (`CommandService.execute()`):
1. **Resolve handler** via `CommandRouter` (maps type string to handler class).
2. **Open Serializable transaction** with 30s timeout.
3. **Idempotency check**: If this `idempotencyKey` + `requestHash` exists, return cached response.
4. **Player lock**: `SELECT ... FOR UPDATE` on the user row prevents concurrent commands.
5. **Execute handler**: `handler.execute(ctx, payload)` returns `{ patches, ui }`.
6. **Persist delta**: Create a `PlayerDelta` row with patches and UI intents.
7. **Store idempotency key**: Cache the response for replay protection.
8. **Commit transaction**.
9. **Publish**: `PubSub.publish('player:<userId>', { deltaId })` notifies the SSE stream.

**Response:**
```json
{
  "patches": [
    { "op": "upsert", "entity": "job", "id": "job_1", "data": { ... } },
    { "op": "upsert", "entity": "entity", "id": "ent_1", "data": { ... } }
  ],
  "ui": [
    { "type": "toast", "tone": "success", "message": "Mission started!" }
  ],
  "cursor": { "delta": "42" }
}
```

### Delta Persistence & Patches

**Patch format:**
```typescript
type Patch =
  | { op: 'upsert'; entity: string; id: string; data: any }
  | { op: 'delete'; entity: string; id: string };
```

- `entity` values: `player`, `entity`, `location`, `building`, `room`, `item`, `job`, `notification`, `currency`, `mission`, `currencyBalance`
- Patches are stored in `PlayerDelta` as JSON alongside `ui` intents.
- Each delta has an auto-incrementing ID used as a cursor.

**UiIntent format:**
```typescript
type UiIntent =
  | { type: 'toast'; tone: 'success' | 'error' | 'info'; message: string }
  | { type: 'navigate'; deepLink: string };
```

> **Note on modals vs. UiIntents:** The `UiIntent` type also defines a `modal` variant
> (`{ type: 'modal'; key; title; body; buttons }`), but this is **not** the primary way
> modals are triggered. Server-driven modals use the `ModalSpecV1` format served by
> `GET /ui/modal`. In practice, command handlers return `toast` and `navigate` intents;
> modals are fetched separately by the frontend via `api.getModalSpec()` (e.g., after
> completing a job, the frontend fetches a follow-up modal). The `modal` UiIntent variant
> exists for potential future use but is not currently wired up in `GameModalHost`.

**Client-side patch application** (`syncSlice.applyPatches()`):
- `upsert`: Sets `data` into the entity table keyed by `id`.
- `delete`: Removes the entry from the entity table.
- **Special case — `player`**: Stored as a single object (not a table). Upsert merges `data` into `state.player` via spread.
- **Special case — `currencyBalance`**: Stored in a flat `state.currencyBalances` map (`{ [currencyId]: amount }`). Upsert merges `data` (the entire balances object) into the map.
- All other entity types are looked up via `ENTITY_KEY_MAP` and stored as `{ [id]: data }` tables.

### SSE Streaming

**Endpoint:** `GET /v1/stream?token=<jwt>&cursor=<lastDeltaId>`

Authentication is via query parameter `token` (JWT), since `EventSource` cannot set custom headers.

**Server events:**
| Event | Data | Purpose |
|-------|------|---------|
| `hello` | `{ ts }` | Connection established |
| `ping` | (empty) | Heartbeat every 15s |
| `delta.available` | `{ deltaId }` | New delta ready to fetch |
| `reset.required` | (empty) | Client should re-bootstrap |

**Flow:**
1. Client connects with cursor.
2. Server sends `hello`, replays any missed deltas since cursor.
3. Server subscribes to `player:<userId>` PubSub channel.
4. When a command creates a new delta, PubSub triggers `delta.available`.
5. Client receives the event and calls `GET /v1/delta?since=<cursor>`.
6. Delta endpoint returns new patches + updated cursor.
7. Client applies patches to Redux store.

### Client-Side Sync Engine

`SyncEngine` (`apps/web/src/services/SyncEngine.ts`) manages the full lifecycle:

| Method | Purpose |
|--------|---------|
| `start()` | Bootstrap + open stream |
| `stop()` | Close stream, clear timers, reset state |
| `openStream()` | Create EventSource, attach event listeners |
| `fetchAndApplyDelta()` | Fetch incremental patches, apply to store |
| `scheduleReconnect()` | Exponential backoff reconnection |

**Initialization** (`useSyncEngine` hook):
- Gates on auth state — only starts after login completes.
- Calls `stop()` on logout.
- Singleton per session.

### useCommand Hook

`useCommand` (`apps/web/src/hooks/useCommand.ts`) is the primary way pages send commands:

```typescript
const { execute } = useCommand({
  onUiIntent: (intent) => {
    if (intent.type === 'toast') showToast(intent);
  },
});

await execute('BuildBuilding', { locationId, buildingDefId });
```

**Behavior:**
- Auto-generates idempotency keys (`<type>-<timestamp>-<counter>`).
- Blocks concurrent commands (throws if one is already pending).
- Applies response patches to Redux immediately.
- Dispatches UI intents to the provided callback.
- 30s client-side timeout.

### Reconnection & Error Handling

**Heartbeat monitoring:**
- Client expects a `ping` or other event within 45 seconds.
- If no event arrives, considers the connection dead and reconnects.

**Exponential backoff:**
- Starts at 1 second, doubles each attempt, caps at 30 seconds.
- Resets to 0 attempts after successful `hello` event.

**Stale cursor handling:**
- If `GET /v1/delta` returns `{ resetRequired: true }`, the delta history has expired.
- Client closes the stream and does a full re-bootstrap.

**Connection states** (`syncSlice.status`):
| Status | Meaning |
|--------|---------|
| `disconnected` | Not connected (initial or after error) |
| `bootstrapping` | Fetching initial snapshot |
| `connected` | Stream active, receiving updates |
| `reconnecting` | Lost connection, attempting to reconnect |

### How to Add a New Command

1. **Create a handler** in `apps/api/src/modules/commands/handlers/`:
   ```typescript
   @Injectable()
   export class MyNewHandler implements CommandHandler {
     constructor(
       private myService: MyService,
       private prisma: PrismaService,
     ) {}

     async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
       const { someId } = payload;

       // Use ctx.tx for ALL database operations
       await this.myService.doSomething(ctx.userId, someId, ctx.tx);

       // Build patches describing what changed
       const pb = new PatchBuilder();
       const updated = await ctx.tx.myEntity.findUnique({ where: { id: someId } });
       pb.upsert('myEntity', updated.id, updated);

       return {
         patches: pb.patches,
         ui: [{ type: 'toast', tone: 'success', message: 'Done!' }],
       };
     }
   }
   ```

2. **Register in `CommandRouter`** (`command.router.ts`):
   - Inject the handler in the constructor.
   - Add `this.register('MyNew', this.myNew);` in the constructor body.

3. **Add to `CommandsModule` providers** in `commands.module.ts`.

4. **Call from frontend:**
   ```typescript
   const { execute } = useCommand();
   await execute('MyNew', { someId: '123' });
   ```

### Transaction Safety Rules

Command handlers receive `ctx.tx` (a Prisma transaction client). Follow these rules to avoid deadlocks:

1. **Always use `ctx.tx`** for all database reads and writes inside the handler.
2. **Never use `this.prisma`** directly in code paths called from a handler — this opens a separate connection that can deadlock with the Serializable transaction.
3. **Service methods** called from handlers should accept an optional `externalTx` parameter:
   ```typescript
   async doSomething(userId: string, id: string, externalTx?: any) {
     const db = externalTx || this.prisma;
     // use db for all queries
   }
   ```
4. **Use `Tx` variants** for services that have them (e.g., `creditTx`, `addItemTx`).
5. **Defer side effects** (notifications, event dispatch) to after the transaction if possible, or wrap in try-catch if they use their own DB connections.
6. **Transaction timeout is 30 seconds** — keep handler logic fast.
