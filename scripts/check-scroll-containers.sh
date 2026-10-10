#!/usr/bin/env bash
# CI guard: flag flex-1 scroll containers missing min-h-0 / min-w-0,
# and vertical scroll containers missing touch-pan-y.
#
# Principle #18 — double-scroll bug prevention.
# Any element that is both a flex child (flex-1) and a scroll region
# (overflow-y-auto, overflow-x-auto) must also carry min-h-0 / min-w-0,
# otherwise flexbox refuses to shrink it and the element overflows its parent.
#
# Principle #19 — touch-scroll bug prevention (iOS Safari).
# Any element with overflow-y-auto must also carry touch-pan-y so iOS Safari
# does not block touch-scroll gestures. Without it, a stacking context on any
# ancestor (e.g. from z-index, opacity animation, or transform) silently
# swallows pan events and the container becomes unscrollable on mobile.
#
# Known-safe exclusions for min-h-0 check:
#   - Already has min-h-0 or min-w-0                → correct, skip
#   - Fixed height via Tailwind (h-1, h-2, h-[32px]) → won't grow, skip
#   - Text-truncation utilities (truncate, text-ellipsis, whitespace-nowrap)
#   - overflow-scroll (full-page scrollers with explicit dimensions)

set -euo pipefail

SEARCH_DIRS="${@:-apps/web/src packages}"

# Check 1: flex-1 + overflow-*-auto missing min-h-0 / min-w-0
VIOLATIONS=$(
  grep -rn "flex-1" $SEARCH_DIRS --include="*.tsx" --include="*.ts" \
    | grep -E "overflow-(y|x)-auto" \
    | grep -v "min-h-0" \
    | grep -v "min-w-0" \
    | grep -v 'h-[0-9]' \
    | grep -v 'h-\[' \
    | grep -v "text-ellipsis" \
    | grep -v "truncate" \
    | grep -v "whitespace-nowrap" \
  || true
)

if [ -n "$VIOLATIONS" ]; then
  echo ""
  echo "ERROR: Scroll-container double-scroll violations (Principle #18):"
  echo "  Each line below has flex-1 + overflow-*-auto but is missing min-h-0 / min-w-0."
  echo ""
  echo "$VIOLATIONS" | sed 's/^/  /'
  echo ""
  echo "  Fix: add min-h-0 (vertical scroll) or min-w-0 (horizontal scroll)."
  echo "  See .agents/skills/derp-dev-principles/SKILL.md §18 for the full rule."
  echo ""
  exit 1
fi

# Check 2: overflow-y-auto missing touch-pan-y
TOUCH_VIOLATIONS=$(
  grep -rn "overflow-y-auto" $SEARCH_DIRS --include="*.tsx" --include="*.ts" \
    | grep -v "touch-pan-y" \
    | grep -v "overflow-x-auto" \
    | grep -v "touchAction" \
    | grep -Ev "^\S+:[0-9]+:\s*[*/]" \
  || true
)

if [ -n "$TOUCH_VIOLATIONS" ]; then
  echo ""
  echo "ERROR: Touch-scroll violations (Principle #19):"
  echo "  Each line below has overflow-y-auto but is missing touch-pan-y."
  echo "  Without touch-pan-y, iOS Safari may block scroll when any ancestor"
  echo "  creates a stacking context (z-index, opacity animation, transform)."
  echo ""
  echo "$TOUCH_VIOLATIONS" | sed 's/^/  /'
  echo ""
  echo "  Fix: add touch-pan-y alongside every overflow-y-auto scroll container."
  echo ""
  exit 1
fi

echo "OK: No scroll-container violations found."
exit 0
