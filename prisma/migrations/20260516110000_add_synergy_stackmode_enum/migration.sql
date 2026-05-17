-- CreateEnum for StackMode
CREATE TYPE "StackMode" AS ENUM ('additive', 'best_only', 'highest_abs_only', 'unique');

-- Drop the default first so the column can be retyped
ALTER TABLE "synergy_rules" ALTER COLUMN "stackMode" DROP DEFAULT;

-- Convert existing TEXT values to the new enum type
ALTER TABLE "synergy_rules"
  ALTER COLUMN "stackMode" TYPE "StackMode"
  USING "stackMode"::"StackMode";

-- Re-add the default using the enum literal
ALTER TABLE "synergy_rules"
  ALTER COLUMN "stackMode" SET DEFAULT 'additive'::"StackMode";
