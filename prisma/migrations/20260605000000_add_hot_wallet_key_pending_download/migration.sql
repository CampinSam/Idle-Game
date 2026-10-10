-- AlterTable: Add one-time key download flag to CryptoWalletConfig
-- Set to true when a new hot wallet is auto-generated on startup or via admin cycle.
-- Cleared to false (permanently) once the admin claims the plaintext key via
-- POST /admin/crypto/wallet/claim-key. Subsequent claim attempts return 400.
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "hotWalletKeyPendingDownload" BOOLEAN NOT NULL DEFAULT false;
