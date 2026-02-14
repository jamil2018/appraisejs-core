-- CreateTable
CREATE TABLE "ConflictResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "conflictingEntityId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConflictResolution_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Locator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
