-- Migration: Add content_drafts table for admin draft & review workflow
-- Uses IF NOT EXISTS / DO blocks throughout — idempotent whether or not the table
-- was previously created via `prisma db push` in any environment.

-- Create enums (idempotent)
DO $$ BEGIN
  CREATE TYPE "ContentDraftOperation" AS ENUM ('create', 'update', 'delete');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContentDraftStatus" AS ENUM ('pending', 'applying', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create table
CREATE TABLE IF NOT EXISTS "content_drafts" (
  "id"             TEXT                     NOT NULL,
  "table_name"     TEXT                     NOT NULL,
  "record_id"      TEXT                     NOT NULL,
  "operation"      "ContentDraftOperation"  NOT NULL,
  "payload"        JSONB                    NOT NULL,
  "status"         "ContentDraftStatus"     NOT NULL DEFAULT 'pending',
  "author_id"      TEXT                     NOT NULL,
  "reviewer_id"    TEXT,
  "review_comment" TEXT,
  "created_at"     TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "content_drafts_table_name_status_idx"
  ON "content_drafts"("table_name", "status");

CREATE INDEX IF NOT EXISTS "content_drafts_author_id_status_idx"
  ON "content_drafts"("author_id", "status");

CREATE INDEX IF NOT EXISTS "content_drafts_status_created_at_idx"
  ON "content_drafts"("status", "created_at" DESC);

-- Partial unique index: only one pending draft per (table_name, record_id)
CREATE UNIQUE INDEX IF NOT EXISTS "content_drafts_pending_record_unique"
  ON "content_drafts"("table_name", "record_id")
  WHERE status = 'pending';

-- Foreign keys (admin_accounts table must already exist from prior migration)
DO $$ BEGIN
  ALTER TABLE "content_drafts"
    ADD CONSTRAINT "content_drafts_author_id_fkey"
    FOREIGN KEY ("author_id")
    REFERENCES "admin_accounts"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "content_drafts"
    ADD CONSTRAINT "content_drafts_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id")
    REFERENCES "admin_accounts"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
