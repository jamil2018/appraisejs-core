-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemplateStepGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'ACTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TemplateStepGroup" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "TemplateStepGroup";
DROP TABLE "TemplateStepGroup";
ALTER TABLE "new_TemplateStepGroup" RENAME TO "TemplateStepGroup";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
