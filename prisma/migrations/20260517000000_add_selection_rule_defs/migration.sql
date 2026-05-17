-- CreateTable: selection_rule_defs
-- Reusable named selection-rule library. Definitions are referenced from
-- any RichSelection tree via { "type": "rule_ref", "id": "<rule-def-id>" }.
-- The SelectionResolverService loads all rows on startup and reloads them
-- after any admin CRUD operation so changes are live without a server restart.

CREATE TABLE "selection_rule_defs" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "tags"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "selection"   JSONB        NOT NULL,
    "enabled"     BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selection_rule_defs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "selection_rule_defs_enabled_idx" ON "selection_rule_defs"("enabled");
