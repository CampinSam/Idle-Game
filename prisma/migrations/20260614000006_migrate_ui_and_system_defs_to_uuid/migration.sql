-- UUID Phase 1 — UI and system defs: VisualEffectDef, TagDef, DisplayDef, NftCollectionDef,
-- Season, AdminRole, ShopTabDef, ModalDef, DefaultModalDef, SelectionRuleDef,
-- SynergyRule, EventDefinition, HomeBannerDef, SystemIconDef.
--
-- Pattern: add key slug alias column (nullable → populate → NOT NULL + UNIQUE), then swap PK to UUID.
-- Child FK columns backfilled via key join before FK constraints are restored.
-- VisualEffectDef and TagDef already have key columns; only id DEFAULT is updated for them.

-- ============================================================
-- 1. VisualEffectDef
--    key column already exists; tag_defs.effectKey references visual_effect_defs(key) not (id),
--    so no FK drops are needed.
-- ============================================================
UPDATE "visual_effect_defs" SET "id" = gen_random_uuid()::TEXT;
ALTER TABLE "visual_effect_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;

-- ============================================================
-- 2. TagDef
--    key column already exists; no FK constraints reference tag_defs(id).
-- ============================================================
UPDATE "tag_defs" SET "id" = gen_random_uuid()::TEXT;
ALTER TABLE "tag_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;

-- ============================================================
-- 3. DisplayDef
--    FK children: mission_defs, mission_category_defs, recipe_defs, building_defs (ON DELETE SET NULL)
-- ============================================================
ALTER TABLE "mission_defs" DROP CONSTRAINT "mission_defs_displayDefId_fkey";
ALTER TABLE "mission_category_defs" DROP CONSTRAINT "mission_category_defs_displayDefId_fkey";
ALTER TABLE "recipe_defs" DROP CONSTRAINT "recipe_defs_displayDefId_fkey";
ALTER TABLE "building_defs" DROP CONSTRAINT "building_defs_displayDefId_fkey";

ALTER TABLE "display_defs" ADD COLUMN "key" TEXT;
UPDATE "display_defs" SET "key" = "id";
ALTER TABLE "display_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "display_defs_key_key" ON "display_defs"("key");

ALTER TABLE "display_defs" ADD COLUMN "id_new" TEXT;
UPDATE "display_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "display_defs" DROP CONSTRAINT "display_defs_pkey";
ALTER TABLE "display_defs" DROP COLUMN "id";
ALTER TABLE "display_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "display_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "display_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "display_defs" ADD CONSTRAINT "display_defs_pkey" PRIMARY KEY ("id");

UPDATE "mission_defs" SET "displayDefId" = dd."id" FROM "display_defs" dd WHERE "mission_defs"."displayDefId" = dd."key";
UPDATE "mission_category_defs" SET "displayDefId" = dd."id" FROM "display_defs" dd WHERE "mission_category_defs"."displayDefId" = dd."key";
UPDATE "recipe_defs" SET "displayDefId" = dd."id" FROM "display_defs" dd WHERE "recipe_defs"."displayDefId" = dd."key";
UPDATE "building_defs" SET "displayDefId" = dd."id" FROM "display_defs" dd WHERE "building_defs"."displayDefId" = dd."key";

ALTER TABLE "mission_defs" ADD CONSTRAINT "mission_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mission_category_defs" ADD CONSTRAINT "mission_category_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipe_defs" ADD CONSTRAINT "recipe_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "building_defs" ADD CONSTRAINT "building_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4. NftCollectionDef
--    FK children: nft_assets.collectionId (55 rows), item_instances.nftCollectionDefId (0 rows)
-- ============================================================
ALTER TABLE "nft_assets" DROP CONSTRAINT "nft_assets_collectionId_fkey";
ALTER TABLE "item_instances" DROP CONSTRAINT "item_instances_nftCollectionDefId_fkey";

ALTER TABLE "nft_collection_defs" ADD COLUMN "key" TEXT;
UPDATE "nft_collection_defs" SET "key" = "id";
ALTER TABLE "nft_collection_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "nft_collection_defs_key_key" ON "nft_collection_defs"("key");

ALTER TABLE "nft_collection_defs" ADD COLUMN "id_new" TEXT;
UPDATE "nft_collection_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "nft_collection_defs" DROP CONSTRAINT "nft_collection_defs_pkey";
ALTER TABLE "nft_collection_defs" DROP COLUMN "id";
ALTER TABLE "nft_collection_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "nft_collection_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "nft_collection_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "nft_collection_defs" ADD CONSTRAINT "nft_collection_defs_pkey" PRIMARY KEY ("id");

UPDATE "nft_assets" SET "collectionId" = nc."id" FROM "nft_collection_defs" nc WHERE "nft_assets"."collectionId" = nc."key";

ALTER TABLE "nft_assets" ADD CONSTRAINT "nft_assets_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "nft_collection_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_nftCollectionDefId_fkey"
  FOREIGN KEY ("nftCollectionDefId") REFERENCES "nft_collection_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 5. Season (0 rows; home_banner_defs.seasonId is all NULL)
-- ============================================================
ALTER TABLE "home_banner_defs" DROP CONSTRAINT "home_banner_defs_seasonId_fkey";

ALTER TABLE "seasons" ADD COLUMN "key" TEXT;
UPDATE "seasons" SET "key" = "id";
ALTER TABLE "seasons" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "seasons_key_key" ON "seasons"("key");

ALTER TABLE "seasons" ADD COLUMN "id_new" TEXT;
UPDATE "seasons" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_pkey";
ALTER TABLE "seasons" DROP COLUMN "id";
ALTER TABLE "seasons" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "seasons" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "seasons" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");

ALTER TABLE "home_banner_defs" ADD CONSTRAINT "home_banner_defs_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 6. AdminRole (1 row; admin_accounts.role_id references old id slug)
--    Note: slug != id (e.g. id='role_super_admin', slug='super_admin')
--    Use key column (copy of old id) for the admin_accounts backfill.
-- ============================================================
ALTER TABLE "admin_accounts" DROP CONSTRAINT "admin_accounts_role_id_fkey";

ALTER TABLE "admin_roles" ADD COLUMN "key" TEXT;
UPDATE "admin_roles" SET "key" = "id";
ALTER TABLE "admin_roles" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "admin_roles_key_key" ON "admin_roles"("key");

ALTER TABLE "admin_roles" ADD COLUMN "id_new" TEXT;
UPDATE "admin_roles" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "admin_roles" DROP CONSTRAINT "admin_roles_pkey";
ALTER TABLE "admin_roles" DROP COLUMN "id";
ALTER TABLE "admin_roles" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "admin_roles" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "admin_roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");

-- Backfill admin_accounts.role_id to the new UUID using key (key = old id slug)
UPDATE "admin_accounts" SET "role_id" = ar."id"
FROM "admin_roles" ar
WHERE "admin_accounts"."role_id" = ar."key";

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- 7. ShopTabDef (5 rows; shop_section_defs.tabId is FK child — 0 rows, no backfill needed)
-- ============================================================
ALTER TABLE "shop_section_defs" DROP CONSTRAINT "shop_section_defs_tabId_fkey";

ALTER TABLE "shop_tab_defs" ADD COLUMN "key" TEXT;
UPDATE "shop_tab_defs" SET "key" = "id";
ALTER TABLE "shop_tab_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "shop_tab_defs_key_key" ON "shop_tab_defs"("key");

ALTER TABLE "shop_tab_defs" ADD COLUMN "id_new" TEXT;
UPDATE "shop_tab_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "shop_tab_defs" DROP CONSTRAINT "shop_tab_defs_pkey";
ALTER TABLE "shop_tab_defs" DROP COLUMN "id";
ALTER TABLE "shop_tab_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "shop_tab_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "shop_tab_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "shop_tab_defs" ADD CONSTRAINT "shop_tab_defs_pkey" PRIMARY KEY ("id");

ALTER TABLE "shop_section_defs" ADD CONSTRAINT "shop_section_defs_tabId_fkey"
  FOREIGN KEY ("tabId") REFERENCES "shop_tab_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- 8. ModalDef (7 rows)
-- ============================================================
ALTER TABLE "modal_defs" ADD COLUMN "key" TEXT;
UPDATE "modal_defs" SET "key" = "id";
ALTER TABLE "modal_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "modal_defs_key_key" ON "modal_defs"("key");

ALTER TABLE "modal_defs" ADD COLUMN "id_new" TEXT;
UPDATE "modal_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "modal_defs" DROP CONSTRAINT "modal_defs_pkey";
ALTER TABLE "modal_defs" DROP COLUMN "id";
ALTER TABLE "modal_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "modal_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "modal_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "modal_defs" ADD CONSTRAINT "modal_defs_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 9. DefaultModalDef (33 rows)
-- ============================================================
ALTER TABLE "default_modal_defs" ADD COLUMN "key" TEXT;
UPDATE "default_modal_defs" SET "key" = "id";
ALTER TABLE "default_modal_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "default_modal_defs_key_key" ON "default_modal_defs"("key");

ALTER TABLE "default_modal_defs" ADD COLUMN "id_new" TEXT;
UPDATE "default_modal_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "default_modal_defs" DROP CONSTRAINT "default_modal_defs_pkey";
ALTER TABLE "default_modal_defs" DROP COLUMN "id";
ALTER TABLE "default_modal_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "default_modal_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "default_modal_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "default_modal_defs" ADD CONSTRAINT "default_modal_defs_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 10. SelectionRuleDef (0 rows)
-- ============================================================
ALTER TABLE "selection_rule_defs" ADD COLUMN "key" TEXT;
UPDATE "selection_rule_defs" SET "key" = "id";
ALTER TABLE "selection_rule_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "selection_rule_defs_key_key" ON "selection_rule_defs"("key");

ALTER TABLE "selection_rule_defs" ADD COLUMN "id_new" TEXT;
UPDATE "selection_rule_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "selection_rule_defs" DROP CONSTRAINT "selection_rule_defs_pkey";
ALTER TABLE "selection_rule_defs" DROP COLUMN "id";
ALTER TABLE "selection_rule_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "selection_rule_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "selection_rule_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "selection_rule_defs" ADD CONSTRAINT "selection_rule_defs_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 11. SynergyRule (7 rows)
-- ============================================================
ALTER TABLE "synergy_rules" ADD COLUMN "key" TEXT;
UPDATE "synergy_rules" SET "key" = "id";
ALTER TABLE "synergy_rules" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "synergy_rules_key_key" ON "synergy_rules"("key");

ALTER TABLE "synergy_rules" ADD COLUMN "id_new" TEXT;
UPDATE "synergy_rules" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "synergy_rules" DROP CONSTRAINT "synergy_rules_pkey";
ALTER TABLE "synergy_rules" DROP COLUMN "id";
ALTER TABLE "synergy_rules" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "synergy_rules" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "synergy_rules" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "synergy_rules" ADD CONSTRAINT "synergy_rules_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 12. EventDefinition (3 rows)
-- ============================================================
ALTER TABLE "event_definitions" ADD COLUMN "key" TEXT;
UPDATE "event_definitions" SET "key" = "id";
ALTER TABLE "event_definitions" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "event_definitions_key_key" ON "event_definitions"("key");

ALTER TABLE "event_definitions" ADD COLUMN "id_new" TEXT;
UPDATE "event_definitions" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "event_definitions" DROP CONSTRAINT "event_definitions_pkey";
ALTER TABLE "event_definitions" DROP COLUMN "id";
ALTER TABLE "event_definitions" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "event_definitions" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "event_definitions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 13. HomeBannerDef (5 rows; seasonId FK was re-added in step 5)
-- ============================================================
ALTER TABLE "home_banner_defs" ADD COLUMN "key" TEXT;
UPDATE "home_banner_defs" SET "key" = "id";
ALTER TABLE "home_banner_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "home_banner_defs_key_key" ON "home_banner_defs"("key");

ALTER TABLE "home_banner_defs" ADD COLUMN "id_new" TEXT;
UPDATE "home_banner_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "home_banner_defs" DROP CONSTRAINT "home_banner_defs_pkey";
ALTER TABLE "home_banner_defs" DROP COLUMN "id";
ALTER TABLE "home_banner_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "home_banner_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "home_banner_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "home_banner_defs" ADD CONSTRAINT "home_banner_defs_pkey" PRIMARY KEY ("id");

-- ============================================================
-- 14. SystemIconDef (2 rows)
-- ============================================================
ALTER TABLE "system_icon_defs" ADD COLUMN "key" TEXT;
UPDATE "system_icon_defs" SET "key" = "id";
ALTER TABLE "system_icon_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "system_icon_defs_key_key" ON "system_icon_defs"("key");

ALTER TABLE "system_icon_defs" ADD COLUMN "id_new" TEXT;
UPDATE "system_icon_defs" SET "id_new" = gen_random_uuid()::TEXT;
ALTER TABLE "system_icon_defs" DROP CONSTRAINT "system_icon_defs_pkey";
ALTER TABLE "system_icon_defs" DROP COLUMN "id";
ALTER TABLE "system_icon_defs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "system_icon_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "system_icon_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE "system_icon_defs" ADD CONSTRAINT "system_icon_defs_pkey" PRIMARY KEY ("id");
