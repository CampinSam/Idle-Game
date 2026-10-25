# Confirmation focus and phase-transition diagnostics

This local follow-up starts from immutable `bdc46514`, on branch
`pilot/modal-confirmation`. It is not published. The document-sync checkpoint
was independently reviewed directly in the workspace: no blocking findings;
the reviewer independently ran its nine focused tests, all passing. They did
not rerun aggregate checks or browser tests. That review needed no corrections.

## Verified defects and fix

Three failing confirmation tests established that the overlay did not receive
or isolate focus, Escape could not cancel it when the parent mission disallowed
closing, and repeated/interrupted overlay lifetimes were not accessible.

The confirmation now exposes a named alertdialog, makes the underlying content
inert and hidden from assistive technology, receives initial focus, and traps
forward/reverse Tab within its controls. Cancel/Escape restores the trigger;
live spec replacement, close and unmount clean up isolation. Escape cancels the
confirmation without overriding the parent mission's dismissal policy.

An added pending-action assertion exposed a second focus-loss path: after
confirming, the original trigger is disabled while the command runs, so it
cannot receive restored focus. This assertion failed before correction; cleanup
now focuses the parent dialog when that trigger is unavailable. Gameplay commands
and state patches are unchanged.

Independent review of the first candidate also identified a nonblocking component
case: closing and reopening with the exact same spec object retained the pending
confirmation. The production host unmounts sessions, so this was not a proven
player-path regression. A new test reproduced it, and close now clears the
pending confirmation even when the spec identity is unchanged.

## Browser timing investigation

The development-only fixture now has bounded configurable response latency,
optional phase-action confirmation, and an 80-entry request/state trace. The
browser harness exercises two cancel/reopen cycles and keyboard containment per
two-phase scenario. Failures save the synthetic UI and trace for diagnosis.

The three-viewport combined run with 800 ms responses passed, including landscape.
This does not prove the cause of the previous timeout. It remains an intermittent
phase-transition symptom; no production synchronization behavior was changed on
that hypothesis. Do not replace evidence-driven diagnosis with longer waits.

## Next work and backend limits

Typed declarative bindings remain independent of this change. Generic key/value
blocks currently use literal strings. The smallest safe next design should add a
shared allowlisted binding type, matching editor validation and renderer support,
then test patch/delete/reset and missing values. Arbitrary expressions and client
gameplay formulas remain out of scope. No binding contract was added here.

The local package check found no PostgreSQL server binaries under standard/vendor
paths, no cached server package or apt candidate, and only libpq client libraries.
No further image pull, package installation, security change, credentials or
database access was attempted. Existing integration setup's destructive schema
push remains unexecuted. Live backend/SSE/player verification is still outstanding
and does not block these deterministic UI tests.

## Checks to reproduce

From `apps/web`:

```sh
node node_modules/vitest/vitest.mjs run src/components/modal/GameModal.confirmation.test.tsx --maxWorkers=2 --minWorkers=1
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node ../../node_modules/eslint/bin/eslint.js src/
```

Start Vite at loopback port 15000, then from the repository root run
`scripts/check-mission-pilot.mjs` with PLAYWRIGHT_MODULE and CHROMIUM_PATH set for
installed tools. Set MISSION_FIXTURE_LATENCY=800 for the slow-response scenario;
the default is 180 ms. Stop Vite afterward. Browser flows use real production
components with synthetic APIs; they are not real network-SSE or backend tests.

No merge, deployment, remote publication, workflow trigger, paid runner,
production mutation or destructive post-merge script is part of this batch.
