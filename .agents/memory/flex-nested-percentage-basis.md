---
name: Nested flex percentage flex-basis pitfall
description: Why flex-1 (flex-basis 0%) fails in deeply nested flex chains and how to fix it
---

## Rule
Do NOT use `flex-1` (`flex: 1 1 0%`) on a page-level wrapper when it is several levels deep in a nested flex column chain. Use `h-full` (`height: 100%`) instead.

**Why:** `flex-basis: 0%` is a percentage — it resolves to 0 only when the parent flex container has a "definite" height per the CSS spec. In a chain like `.layout → .content → .body-card → .page-transition-wrapper → PAGE_WRAPPER`, intermediate levels that get their height purely from flex-grow may not propagate "definiteness" to their children consistently across all browsers (particularly older mobile WebKit). When resolution fails, `flex-basis: 0%` falls back to `content` size, the inner list sizes to its content height, and a bottom-pinned sibling ends up stranded mid-card.

**How to apply:**
- Page-root divs inside `<Outlet />` (i.e., direct children of `.page-transition-wrapper`) should use `h-full` to establish a definite height via an explicit `height: 100%` rather than relying on `flex-1`.
- Children of that wrapper (CARD_CLASS, list wrappers) can still safely use `flex-1 min-h-0` because `h-full` gives the parent a definite height that makes percentage flex-bases resolve correctly.
- Panel / footer elements pinned to the bottom of CARD_CLASS should be INSIDE CARD_CLASS as `flex-shrink-0` siblings of the flex-1 list, not outside as siblings of CARD_CLASS.
