-- CreateTable: store per-alias hidden flag as a local overlay on OPNsense data
CREATE TABLE "NetworkAliasDisplaySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnsenseAliasUuid" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkAliasDisplaySettings_opnsenseAliasUuid_key" ON "NetworkAliasDisplaySettings"("opnsenseAliasUuid");
