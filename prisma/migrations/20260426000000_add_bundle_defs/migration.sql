-- CreateTable
CREATE TABLE "bundle_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "bundle" JSONB NOT NULL DEFAULT '[]',
    "odds" DOUBLE PRECISION,
    "pickMin" INTEGER,
    "pickMax" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundle_defs_pkey" PRIMARY KEY ("id")
);
