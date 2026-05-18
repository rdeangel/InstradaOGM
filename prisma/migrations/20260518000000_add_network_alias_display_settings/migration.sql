-- CreateTable: store per-alias hidden flag as a local overlay on OPNsense data
CREATE TABLE "NetworkAliasDisplaySettings" (
    "id" TEXT NOT NULL,
    "opnsenseAliasUuid" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkAliasDisplaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkAliasDisplaySettings_opnsenseAliasUuid_key" ON "NetworkAliasDisplaySettings"("opnsenseAliasUuid");
