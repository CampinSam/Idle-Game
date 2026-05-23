-- Remove orphaned content-document seeds
--
-- Task #735 removed mission_active_document and mission_outcome_document from
-- the bootstrap seeds. These rows are no longer fetched or rendered anywhere;
-- deleting them keeps the game_definitions table tidy and avoids confusion
-- when browsing admin content.

DELETE FROM game_definitions
WHERE type = 'content_document'
  AND key IN ('mission_active_document', 'mission_outcome_document');
