-- CreateTable
CREATE TABLE IF NOT EXISTS "game_constants" (
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_constants_pkey" PRIMARY KEY ("key")
);
