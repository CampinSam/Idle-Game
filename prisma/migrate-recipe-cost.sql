-- One-time migration: Convert recipe_defs.cost from map format to array format
-- Map format: { "soft_arcanium": 20 } -> Array format: [{ "type": "currency", "id": "soft_arcanium", "amount": 20 }]
-- Items (prefixed with mat_) get type "item", all others get type "currency"

UPDATE recipe_defs
SET cost = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', CASE WHEN key LIKE 'mat_%' THEN 'item' ELSE 'currency' END,
      'id', key,
      'amount', value::numeric
    )
  ), '[]'::jsonb)
  FROM jsonb_each(cost::jsonb)
)
WHERE jsonb_typeof(cost::jsonb) = 'object';
