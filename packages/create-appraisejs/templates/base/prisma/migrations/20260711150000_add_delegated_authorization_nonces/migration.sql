CREATE TABLE "DelegatedAuthorizationNonce" (
    "nonce" TEXT NOT NULL PRIMARY KEY,
    "issuer" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DelegatedAuthorizationNonce_expiresAt_idx" ON "DelegatedAuthorizationNonce"("expiresAt");
