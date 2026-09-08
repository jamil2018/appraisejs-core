-- CreateTable
CREATE TABLE "QualityJourneyDraftReuseAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "assetPortableId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyDraftReuseAnnotation_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "QualityJourneyDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDraftReuseAnnotation_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDraftReuseAnnotation_draftId_key" ON "QualityJourneyDraftReuseAnnotation"("draftId");

-- CreateIndex
CREATE INDEX "QualityJourneyDraftReuseAnnotation_bindingId_assetPortableId_sourceVersion_idx" ON "QualityJourneyDraftReuseAnnotation"("bindingId", "assetPortableId", "sourceVersion");
