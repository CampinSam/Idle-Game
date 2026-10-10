-- Backfill lifetimeXp for all existing entities that lack it.
-- Uses each entity's stored level and residual XP together with the
-- entity_definition's xpCurve to reconstruct approximate lifetime XP.
-- After this migration the XP-grant path keeps lifetimeXp up-to-date, and
-- regenerateEntity uses it to re-derive level under any future curve change.
DO $$
DECLARE
  r              RECORD;
  entity_level   INT;
  residual_xp    FLOAT;
  xp_curve       JSONB;
  curve_kind     TEXT;
  curve_base     FLOAT;
  curve_ratio    FLOAT;
  lifetime_xp    FLOAT;
  L              INT;
  per_level_val  FLOAT;
BEGIN
  FOR r IN
    SELECT
      e.id,
      GREATEST(COALESCE((e.progression ->> 'level')::int, 1), 1) AS lvl,
      GREATEST(COALESCE((e.progression ->> 'xp')::float,    0), 0) AS xp,
      ed.progression AS ed_progression
    FROM entities e
    JOIN entity_definitions ed ON e."definitionId" = ed.id
    WHERE e.progression IS NOT NULL
      AND NOT (e.progression ? 'lifetimeXp')
  LOOP
    entity_level := r.lvl;
    residual_xp  := r.xp;
    xp_curve     := (r.ed_progression -> 'xpCurve');
    lifetime_xp  := residual_xp;

    IF xp_curve IS NOT NULL AND entity_level > 1 THEN
      curve_kind := xp_curve ->> 'kind';

      IF curve_kind = 'geometric' THEN
        curve_base  := (xp_curve ->> 'base')::float;
        curve_ratio := (xp_curve ->> 'ratio')::float;
        FOR L IN 1..(entity_level - 1) LOOP
          lifetime_xp := lifetime_xp + FLOOR(curve_base * POWER(curve_ratio, L - 1));
        END LOOP;

      ELSIF curve_kind = 'table' THEN
        -- perLevel is 0-indexed: perLevel[L-1] is XP needed to leave level L
        FOR L IN 1..(entity_level - 1) LOOP
          per_level_val := COALESCE(
            (xp_curve -> 'perLevel' -> (L - 1))::float,
            0
          );
          lifetime_xp := lifetime_xp + FLOOR(GREATEST(per_level_val, 0));
        END LOOP;
      END IF;
    END IF;

    UPDATE entities
    SET progression = jsonb_set(
      progression,
      '{lifetimeXp}',
      to_jsonb(GREATEST(FLOOR(lifetime_xp), 0)::bigint)
    )
    WHERE id = r.id;
  END LOOP;
END $$;
