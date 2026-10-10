---
name: iOS scroll + animation fill-mode
description: transform retained via animation-fill-mode:both on an ancestor blocks touch-scroll on iOS Safari; how to fix it and the touch-pan-y pattern.
---

## Rule
Never let a page-wrapper animation retain `transform` via `animation-fill-mode: both/forwards`. On iOS Safari, any non-`none` transform on an ancestor of an `overflow: auto/scroll` container can silently prevent touch-scroll gestures.

**Why:** `transform: scale(1)` is visually a no-op but still creates a stacking context. iOS Safari has a longstanding bug where scroll containers inside stacking-context ancestors do not respond to touch pan events.

**How to apply:**
- `@keyframes page-enter` (and any similar page-transition keyframes) — the `to` frame must NOT set `transform` (or use `transform: none` explicitly) so fill-mode doesn't retain a transform value.
- Scroll containers on location/detail pages should include `touch-pan-y` (Tailwind v3 utility → `touch-action: pan-y`) to explicitly permit vertical pan gestures. This matches the `style={{ touchAction: 'pan-y' }}` pattern already used in EntityDetailContent.
- After fixing source, always rebuild `dist/` (`pnpm --filter @derp/web build`) — the production deployment serves committed dist assets.
