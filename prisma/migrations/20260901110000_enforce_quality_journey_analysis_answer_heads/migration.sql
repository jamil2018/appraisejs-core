-- A correction has one successor at most. Combined with the service's root/head
-- checks, this makes every question's immutable answer lineage a single chain.
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_correctionOfAnswerId_key"
ON "QualityJourneyAnalysisAnswer"("correctionOfAnswerId");
