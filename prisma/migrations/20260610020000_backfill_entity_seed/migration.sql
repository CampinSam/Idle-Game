-- Assign a random seed to every entity that currently has seed = NULL.
-- After this migration the regenerateEntity rebuild path always has a seed
-- to work from, so scratch rebuilds are deterministic across repeated calls.
UPDATE entities
SET seed = FLOOR(RANDOM() * 2147483647)::int
WHERE seed IS NULL;
