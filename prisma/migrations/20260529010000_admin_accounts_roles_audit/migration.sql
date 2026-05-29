-- CreateTable admin_roles
CREATE TABLE "admin_roles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "permission_flags" JSONB NOT NULL DEFAULT '{}',
  "is_built_in" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_roles_slug_key" ON "admin_roles"("slug");

-- CreateTable admin_accounts
CREATE TABLE "admin_accounts" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "content_scopes" TEXT[] NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_accounts_username_key" ON "admin_accounts"("username");
CREATE INDEX "admin_accounts_role_id_idx" ON "admin_accounts"("role_id");

-- CreateTable admin_audit_logs
CREATE TABLE "admin_audit_logs" (
  "id" BIGSERIAL NOT NULL,
  "admin_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "table_name" TEXT,
  "record_id" TEXT,
  "diff" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at" DESC);
CREATE INDEX "admin_audit_logs_table_name_created_at_idx" ON "admin_audit_logs"("table_name", "created_at" DESC);

-- Foreign keys
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed built-in roles
INSERT INTO "admin_roles" ("id", "name", "slug", "permission_flags", "is_built_in") VALUES
  ('role_super_admin',      'Super Admin',      'super_admin',      '{"read":true,"write":true,"approve":true,"player_read":true,"player_write":true,"system_tools":true}',  true),
  ('role_content_creator',  'Content Creator',  'content_creator',  '{"read":true,"write":true,"approve":false,"player_read":false,"player_write":false,"system_tools":false}', true),
  ('role_content_reviewer', 'Content Reviewer', 'content_reviewer', '{"read":true,"write":false,"approve":true,"player_read":false,"player_write":false,"system_tools":false}', true),
  ('role_support',          'Support',          'support',          '{"read":false,"write":false,"approve":false,"player_read":true,"player_write":false,"system_tools":false}', true),
  ('role_senior_support',   'Senior Support',   'senior_support',   '{"read":false,"write":false,"approve":false,"player_read":true,"player_write":true,"system_tools":false}',  true)
ON CONFLICT DO NOTHING;
