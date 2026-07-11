CREATE TABLE "DelegatedValidationAstSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "astId" TEXT NOT NULL,
    "astJson" TEXT NOT NULL,
    "receiptJson" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DelegatedValidationAstSubmission_nonce_key" ON "DelegatedValidationAstSubmission"("nonce");
CREATE INDEX "DelegatedValidationAstSubmission_targetFingerprint_planHash_receivedAt_idx" ON "DelegatedValidationAstSubmission"("targetFingerprint", "planHash", "receivedAt");
