-- DB-backed registry of system reward-type icon keys. Replaces the
-- hardcoded REWARD_TYPE_ICON_MAP constant so game designers can add new
-- reward icon types via the admin panel without a code deploy.
--
-- id: the icon key / reward type string (e.g. "entity_xp", "keeper_xp").
--     Bare-name resolution maps this to /media/images/icons/{id}.png.
-- name: human-readable display name shown in the Icon Manager.

CREATE TABLE IF NOT EXISTS "system_icon_defs" (
  "id"        TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_icon_defs_pkey" PRIMARY KEY ("id")
);

-- Backfill the two built-in keys that previously lived in shared constants.
INSERT INTO "system_icon_defs" ("id", "name", "updatedAt")
VALUES
  ('entity_xp', 'Entity XP',  CURRENT_TIMESTAMP),
  ('keeper_xp', 'Keeper XP',  CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
