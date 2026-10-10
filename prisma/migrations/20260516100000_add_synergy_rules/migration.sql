-- CreateTable: synergy_rules
-- Universal admin-authored rule system for synergy bonuses/penalties
-- between traits, entity types, collections, factions, regions, and activities.

CREATE TABLE "synergy_rules" (
    "id"              TEXT         NOT NULL,
    "name"            TEXT         NOT NULL,
    "description"     TEXT,
    "enabled"         BOOLEAN      NOT NULL DEFAULT true,
    "sourceSelector"  JSONB        NOT NULL DEFAULT '{}',
    "targetSelector"  JSONB        NOT NULL DEFAULT '{}',
    "context"         JSONB        NOT NULL DEFAULT '{}',
    "conditions"      JSONB        NOT NULL DEFAULT '[]',
    "effects"         JSONB        NOT NULL,
    "priority"        INTEGER      NOT NULL DEFAULT 100,
    "stackGroup"      TEXT,
    "stackMode"       TEXT         NOT NULL DEFAULT 'additive',
    "maxApplications" INTEGER      NOT NULL DEFAULT 1,
    "startsAt"        TIMESTAMP(3),
    "endsAt"          TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synergy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synergy_rules_enabled_idx" ON "synergy_rules"("enabled");
