-- AlterTable: Add encrypted hot wallet signing key field to CryptoWalletConfig
-- Stored as AES-256-GCM ciphertext (iv:authTag:ciphertext hex). Empty string means
-- no key is stored; the withdrawal processor falls back to HOT_WALLET_SKEY_HEX env var.
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "hotWalletSkeyEncrypted" TEXT NOT NULL DEFAULT '';
