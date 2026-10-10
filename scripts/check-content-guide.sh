#!/usr/bin/env bash
# check-content-guide.sh
#
# Cross-checks that every enum value and definition type documented in
# admin-schemas.md also appears in content-creator-guide.md.
#
# Usage:
#   bash scripts/check-content-guide.sh
#
# Exit code 0 = all checks passed. Non-zero = at least one divergence found.
# Run this whenever you add a new enum value, definition type, or admin-schema
# section so stale guide entries are caught before they reach players.

set -euo pipefail

ADMIN="admin-schemas.md"
GUIDE="content-creator-guide.md"
ERRORS=0

# Helper: check a single value appears in the guide
check_value() {
  local section="$1"
  local value="$2"
  if ! grep -qF "\`${value}\`" "$GUIDE"; then
    echo "  MISSING  [${section}] \`${value}\` not found in content-creator-guide.md"
    ERRORS=$((ERRORS + 1))
  fi
}

# Helper: extract the first backtick-quoted token from pipe-table rows in a
# section of admin-schemas.md between two heading patterns.
# Usage: extract_enum_values "## \`SectionName\`" "^## " | while read value; do ...
extract_enum_values() {
  local start_pattern="$1"
  local stop_pattern="$2"
  # Print lines between start and stop, then grep for table rows with a backtick value
  awk "/${start_pattern}/,/${stop_pattern}/" "$ADMIN" \
    | grep -oP '(?<=\| )`[^`]+`' \
    | head -1  # this is wrong — we want all rows
}

# Better helper: given a start heading and stop heading, extract first-column
# backtick values from markdown pipe-table rows.
extract_section_enum_values() {
  local start_pattern="$1"
  local stop_pattern="${2:-^## }"
  awk "
    /^${start_pattern}/ { found=1; next }
    found && /^${stop_pattern}/ { exit }
    found && /^\| \`/ { match(\$0, /\`[^\`]+\`/); print substr(\$0, RSTART+1, RLENGTH-2) }
  " "$ADMIN"
}

echo "=== Checking content-creator-guide.md against admin-schemas.md ==="
echo ""

# ── 1. EffectCategory enum ──────────────────────────────────────────────────
echo "1. EffectCategory enum values"
while IFS= read -r value; do
  check_value "EffectCategory" "$value"
done < <(
  awk '/^## `EffectCategory` Enum/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 2. EffectValueMode enum ─────────────────────────────────────────────────
echo "2. EffectValueMode enum values"
while IFS= read -r value; do
  check_value "EffectValueMode" "$value"
done < <(
  awk '/^## `EffectValueMode` Enum/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 3. EffectDurationModel enum ─────────────────────────────────────────────
echo "3. EffectDurationModel enum values"
while IFS= read -r value; do
  check_value "EffectDurationModel" "$value"
done < <(
  awk '/^## `EffectDurationModel` Enum/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 4. EffectStackingRule enum ───────────────────────────────────────────────
echo "4. EffectStackingRule enum values"
while IFS= read -r value; do
  check_value "EffectStackingRule" "$value"
done < <(
  awk '/^## `EffectStackingRule` Enum/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 5. EffectTargetType enum ─────────────────────────────────────────────────
echo "5. EffectTargetType enum values"
while IFS= read -r value; do
  check_value "EffectTargetType" "$value"
done < <(
  awk '/^## `EffectTargetType` Enum/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 6. PowerDef powerType values ─────────────────────────────────────────────
echo "6. PowerDef powerType values"
while IFS= read -r value; do
  check_value "PowerDef.powerType" "$value"
done < <(
  awk '/^### `powerType` values/{found=1; next} found && /^## /{exit} found && /^\| `/{match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)}' "$ADMIN"
)

# ── 7. SynergyRule stackMode values ─────────────────────────────────────────
echo "7. SynergyRule stackMode values"
for value in additive unique best_only highest_abs_only; do
  check_value "SynergyRule.stackMode" "$value"
done

# ── 8. Definition type headings ─────────────────────────────────────────────
# Check that major definition type names documented in admin-schemas.md each
# have a corresponding section in the guide.
echo "8. Definition type headings"
DEFINITION_TYPES=(
  "EntityDefinition"
  "NftCollectionDef"
  "LocationDefinition"
  "BuildingDef"
  "MissionDef"
  "RecipeDef"
  "ItemDefinition"
  "LootboxDef"
  "BundleDef"
  "GiftDef"
  "Currency"
  "ShopItemDef"
  "ShopTabDef"
  "ShopSectionDef"
  "ShopHeroDef"
  "EventDefinition"
  "TelemetryDef"
  "CheckInDef"
  "QuestDef"
  "HomeBannerDef"
  "EffectDef"
  "PowerDef"
  "ModalDef"
  "DisplayDef"
  "SynergyRule"
  "SelectionRuleDef"
  "GameDefinition"
  "TagDef"
  "GameConstant"
)

for deftype in "${DEFINITION_TYPES[@]}"; do
  if ! grep -qF "## ${deftype}" "$GUIDE"; then
    echo "  MISSING  Definition type \`${deftype}\` has no section heading in content-creator-guide.md"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All checks passed. content-creator-guide.md is in sync with admin-schemas.md."
  exit 0
else
  echo "Found ${ERRORS} divergence(s). Update content-creator-guide.md to match admin-schemas.md."
  echo ""
  echo "Tip: Search content-creator-guide.md for the section that covers the"
  echo "     missing value and add a table row or entry for it."
  exit 1
fi
