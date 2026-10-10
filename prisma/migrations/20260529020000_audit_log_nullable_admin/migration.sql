-- Make admin_id nullable (accounts can be deleted without losing audit history)
ALTER TABLE "admin_audit_logs" ALTER COLUMN "admin_id" DROP NOT NULL;

-- Drop old RESTRICT FK and replace with SET NULL
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS "admin_audit_logs_admin_id_fkey";
ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
