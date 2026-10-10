-- Drop the legacy `iconUrl` column from item_defs. Project now has a single
-- canonical icon field (`iconKey`) that the iconResolver expands either as a
-- full path or as a bare-name shortcut to /media/images/icons/<key>.png.

ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "iconUrl";
