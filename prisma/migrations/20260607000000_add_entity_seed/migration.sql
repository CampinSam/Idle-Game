-- AlterTable: Entity gains a seed column for deterministic rebuild
ALTER TABLE "entities" ADD COLUMN "seed" INTEGER;
