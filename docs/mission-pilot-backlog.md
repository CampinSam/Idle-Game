# Mission pilot continuation — October 25, 2026

Starting point: reviewed pilot `00ad76724df94703390de802ce79d783e1ed37ee`,
published in draft PR #6. Remote main remains `c7ab205e36d28d10140f840b18ac6fe489fc5e09`.
This batch is on local branch `pilot/document-sync`, pending independent review.

## Completed batch: document presentation synchronized with live state

Four red tests established these bugs before fixes:

- A replacement document ID continued displaying the previous fetched document,
  including after the replacement failed; removing the source also retained it.
- The server transitions ready jobs to `ready_notified`, but `job.ready` context
  rules did not recognize that state. A deterministic EventSource notification
  through real SyncEngine, Redux and SurfaceContext reproduced the mismatch.
- Presentation classes and validation ran before SurfaceContext applied live
  rules, so blocks and their enclosing layout consumed different context.

Each source now owns a separate fetch lifetime. Runtime validation and layout
read the same merged context as blocks. Readiness includes `ready_notified`;
phase decisions remain separate. No backend contract, gameplay or framework
changes were made. The author guide documents these semantics.

All four original regressions passed after the fixes. Five additional cases
cover inline/fetched swaps, unrelated jobs and non-collectible statuses. The full
suite passed 100 tests across 19 files. TypeScript and production build passed;
lint passed with zero errors and 28 existing warnings. Content-guide,
scroll-container and diff-whitespace checks passed.

Browser coverage: the existing synthetic production-component harness passed
320x720 and 390x844. The combined run timed out awaiting the phase-decision
heading at 844x390; a single isolated landscape diagnostic then passed all
checks, including decision/result scroll ownership. This is an unresolved timing
flake, not a clean three-case aggregate pass. Both logs are retained in the
review evidence. The new declarative overrides are covered by deterministic
integration tests, not by a new browser scenario.

## Next bounded batches

1. **Modal confirmation focus** — source-verified gap: GameModal's focus trap
   includes underlying controls while its confirmation overlay is present.
   Add keyboard-cycle, Escape and focus-restoration tests before changing it.
2. **SSE ordering and browser timing** — hypothesis to reproduce: concurrent
   `fetchAndApplyDelta` requests may complete out of order; the current function
   has no request ordering guard. Test reversed responses, reconnect/reset and
   stop with pending fetches before choosing a fix. Diagnose the landscape
   phase-transition flake with deterministic delays instead of increasing waits.
3. **Bounded declarative bindings** — feature gap, not a regression: generic
   `key_value_row` currently renders literal `label`/`value`; mission blocks read
   explicit SurfaceContext data. Define typed, allowlisted bindings and editor
   validation together, with tests for patch/delete/reset, rather than adding
   arbitrary expressions or duplicating authoritative gameplay calculations.
4. **Isolated backend/SSE verification** — keep independent from the above work.
   Revisit a disposable Postgres migration replay and real API/stream tests once
   tooling is ready; do not use production credentials or data.

## Backend setup findings

Docker is available, but no PostgreSQL binaries or cached images were present.
A bounded official `postgres:16` pull timed out after 90 seconds; image inspect
confirmed no usable image. No container/database/backend service was started.
The existing API integration global setup calls `prisma db push
--accept-data-loss`; it was inspected but not executed. A safe follow-up should
use an explicitly disposable database and tracked migrations, with an isolated
environment and no Object Storage access. Production DATABASE_URL is unnecessary.

The package-manager install attempt failed creating its default store under
`/home/agent`; existing restored dependencies were usable, so no install was
needed for these checks. A future install should use a writable isolated store.

## Reproduction

From `apps/web` with the declared dependencies available:

```sh
node node_modules/vitest/vitest.mjs run src/features/content-document/ContentDocumentRenderer.sync.test.tsx --maxWorkers=2 --minWorkers=1
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node ../../node_modules/eslint/bin/eslint.js src/
```

From the repository root, run `bash scripts/check-content-guide.sh` and
`bash scripts/check-scroll-containers.sh`. For the existing browser harness,
start Vite on loopback port 15000, then run `scripts/check-mission-pilot.mjs`
with PLAYWRIGHT_MODULE and CHROMIUM_PATH pointing to installed tools. Stop Vite
afterward. Recorded runtime: Node 24.19.0; Node 20 parity remains unverified.

Real database/API/SSE, native browser history, Safari/mobile keyboard, zoom and
real-player verification remain outstanding. No merge, deployment, workflow
trigger, production mutation or destructive post-merge script was performed.
