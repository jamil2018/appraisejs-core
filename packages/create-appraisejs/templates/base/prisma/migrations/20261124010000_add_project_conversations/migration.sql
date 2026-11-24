CREATE TABLE "ProjectConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "initialIdempotencyKey" TEXT,
    "nextOrdinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectConversation_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProjectConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contextJson" TEXT,
    "recordsJson" TEXT,
    "turnId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ProjectConversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProjectConversation_targetProjectId_updatedAt_id_idx" ON "ProjectConversation"("targetProjectId", "updatedAt", "id");
CREATE UNIQUE INDEX "ProjectConversation_targetProjectId_initialIdempotencyKey_key" ON "ProjectConversation"("targetProjectId", "initialIdempotencyKey");
CREATE UNIQUE INDEX "ProjectConversationMessage_conversationId_ordinal_key" ON "ProjectConversationMessage"("conversationId", "ordinal");
CREATE UNIQUE INDEX "ProjectConversationMessage_conversationId_idempotencyKey_key" ON "ProjectConversationMessage"("conversationId", "idempotencyKey");
CREATE INDEX "ProjectConversationMessage_conversationId_turnId_idx" ON "ProjectConversationMessage"("conversationId", "turnId");
