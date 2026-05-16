-- Task #375: Trim prod seed content
-- One-time production cleanup to delete the rows that were removed from the
-- seed sources in apps/api/src/seeds/data/{definitions,item-defs}.json.
--
-- IMPORTANT: production queries via the agent's database tool are read-only.
-- Run this script directly against the production database (e.g. via psql
-- against $DATABASE_URL on the deployed app, or any prod-DB console).
--
-- Wrapped in a single transaction so a failure on any step rolls back.

BEGIN;

-- 0. Pre-fix: re-point the kept location away from a region we're about to
-- delete (LocationDefinition.regionId is ON DELETE SET NULL, but we want it
-- to land on the canonical kept region instead of NULL).
UPDATE location_definitions
   SET "regionId" = 'derpshire_valley'
 WHERE id = 'loc_glitch_incubator_site'
   AND "regionId" = 'reconstruction_zone_alpha';

-- 1. gift_defs (no FK from gift_instances; instances are left untouched and
-- become "orphan snapshots" — their `snapshot` JSON already has everything
-- the claim flow needs).
DELETE FROM gift_defs WHERE id IN (
  'gift_checkin_seasonal_frost_sm',
  'gift_checkin_seasonal_frost_md',
  'gift_checkin_seasonal_frost_lg'
);

-- 2. lootbox_defs (item_mystery_egg is the only item_def referencing
-- lootbox_mystery_egg; that item is removed in step 6 below — but lootbox
-- removal still works first because the FK is via item_defs.lootboxDefId
-- pointing _into_ lootbox_defs and the column has no FK constraint).
DELETE FROM lootbox_defs WHERE id IN ('lootbox_mystery_egg');

-- 3. mission_defs (jobs.defId is just an indexed string column — no FK).
DELETE FROM mission_defs WHERE id IN (
  'mission_mana_expedition',
  'mission_test_flags',
  'mission_void_rift',
  'quick_egg_hunt',
  'quick_mail_run',
  'quick_mushroom_patrol',
  'standard_bandit_camp',
  'standard_tower_climb'
);

-- 4. mission_category_defs (FK from mission_defs.missionCategoryDefId is
-- ON DELETE SET NULL; the only mission in cat_test was mission_test_flags,
-- removed above, so this is now empty).
DELETE FROM mission_category_defs WHERE id IN ('cat_test');

-- 5. item_defs — item_common_chest and item_rare_crate are RESTRICT-blocked
-- by existing player item_instances / item_ledger rows and are intentionally
-- LEFT IN PLACE per the "do not delete non-seed rows" rule. See the
-- "Blocked rows" section at the bottom of this file.
DELETE FROM item_defs WHERE id IN (
  'consumable_revival_token',
  'consumable_xp_scroll',
  'gear_shadow_cloak',
  'item_mystery_egg',
  'mat_ember_crystal',
  'mat_shadow_silk',
  'mat_silver_dust',
  'mat_void_essence',
  'quest_ancient_map'
);

-- 6. modal_defs (no FK; building/mission modal-link columns are plain strings).
DELETE FROM modal_defs WHERE id IN (
  'modal_list_smoke',
  'modal_clickreveal_smoke'
);

-- 7. location_definitions (no live LocationInstance rows reference outpost_default).
DELETE FROM location_definitions WHERE id IN ('outpost_default');

-- 8. entity_definitions (no live Entity rows reference derp_outpost).
DELETE FROM entity_definitions WHERE id IN ('derp_outpost');

-- 9. region_definitions — must be after location_definitions/missions.
-- LocationDefinition.regionId is ON DELETE SET NULL; we already re-pointed
-- the only kept location (loc_glitch_incubator_site) in step 0.
DELETE FROM region_definitions WHERE id IN (
  'frostpeak_range',
  'reconstruction_zone_alpha',
  'region_crystal_peaks',
  'region_verdant_glade',
  'shadow_marshes',
  'verdant_hollow'
);

COMMIT;

-- ============================================================================
-- Blocked rows — INTENTIONALLY NOT DELETED
-- ============================================================================
-- Per the "may only remove rows that were removed from seed data; existing
-- rows not contained in the seed data must remain" rule, the following
-- definitions still exist in prod and were NOT removed because deleting them
-- would either be blocked by, or would CASCADE-delete, live player-owned
-- rows. They live on as orphan defs (the seed JSON no longer recreates them,
-- so they will not come back on future deploys, but the existing rows remain
-- until you decide what to do with the player data).
--
--   currencies.season_frost_coin
--     - 2 user_currency_balances (300 total) ON DELETE RESTRICT
--     - 8 currency_ledger rows ON DELETE RESTRICT
--
--   item_defs.item_common_chest
--     - 2 item_instances ON DELETE RESTRICT
--     - 1 item_ledger row ON DELETE RESTRICT
--
--   item_defs.item_rare_crate
--     - 1 item_instance ON DELETE RESTRICT
--     - 1 item_ledger row ON DELETE RESTRICT
--
--   checkin_defs.checkin_seasonal_track
--     - 4 checkin_instances ON DELETE CASCADE
--       (would silently delete the player rows on parent delete)
--
-- To finish removing any of these, decide first whether to migrate or hard-
-- delete the player data, run that step explicitly, then re-run the matching
-- DELETE here.
