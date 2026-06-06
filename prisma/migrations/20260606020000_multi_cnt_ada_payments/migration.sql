-- AddColumn: ada_withdrawal_fee and ada_min_withdrawal_amount on crypto_wallet_configs
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "ada_withdrawal_fee" BIGINT NOT NULL DEFAULT 5000000;
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "ada_min_withdrawal_amount" BIGINT NOT NULL DEFAULT 2000000;

-- AddColumn: ada_service_fee and ada_network_fee on crypto_withdrawals
ALTER TABLE "crypto_withdrawals" ADD COLUMN IF NOT EXISTS "ada_service_fee" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "crypto_withdrawals" ADD COLUMN IF NOT EXISTS "ada_network_fee" BIGINT NOT NULL DEFAULT 0;

-- CreateTable: unresolved_deposits
CREATE TABLE IF NOT EXISTS "unresolved_deposits" (
    "id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "block_time" INTEGER NOT NULL,
    "sender_addresses" JSONB NOT NULL,
    "amounts" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "credited_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unresolved_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "unresolved_deposits_tx_hash_key" ON "unresolved_deposits"("tx_hash");
CREATE INDEX IF NOT EXISTS "unresolved_deposits_resolved_at_idx" ON "unresolved_deposits"("resolved_at");

-- AddForeignKey
ALTER TABLE "unresolved_deposits" ADD CONSTRAINT "unresolved_deposits_resolved_by_user_id_fkey"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "unresolved_deposits" ADD CONSTRAINT "unresolved_deposits_credited_user_id_fkey"
    FOREIGN KEY ("credited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
