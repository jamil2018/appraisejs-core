ALTER TABLE "ProjectConversation" ADD COLUMN "readProvider" TEXT NOT NULL DEFAULT 'LOCAL'
    CHECK ("readProvider" IN ('LOCAL', 'CHATGPT'));

CREATE UNIQUE INDEX "ProjectConversationMessage_conversationId_id_key"
    ON "ProjectConversationMessage"("conversationId", "id");

CREATE TABLE "ProjectConversationRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL CHECK ("provider" = 'CHATGPT'),
    "state" TEXT NOT NULL,
    "blockedConversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "settledAt" DATETIME,
    "releasedAt" DATETIME,
    "recordsJson" TEXT,
    CONSTRAINT "ProjectConversationRead_message_fkey" FOREIGN KEY ("conversationId", "messageId")
        REFERENCES "ProjectConversationMessage"("conversationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectConversationRead_state_check" CHECK (
        ("state" = 'RUNNING' AND "blockedConversationId" IS "conversationId"
            AND "settledAt" IS NULL AND "releasedAt" IS NULL AND "recordsJson" IS NULL)
        OR ("state" = 'COMPLETED' AND "blockedConversationId" IS NULL
            AND "settledAt" IS NOT NULL AND "releasedAt" IS NULL AND "recordsJson" IS NOT NULL)
        OR ("state" = 'FAILED' AND "blockedConversationId" IS NULL
            AND "settledAt" IS NOT NULL AND "releasedAt" IS NULL AND "recordsJson" IS NULL)
        OR ("state" = 'UNKNOWN' AND "settledAt" IS NOT NULL AND "recordsJson" IS NULL AND (
            ("blockedConversationId" IS "conversationId" AND "releasedAt" IS NULL)
            OR ("blockedConversationId" IS NULL AND "releasedAt" IS NOT NULL)
        ))
    )
);

CREATE UNIQUE INDEX "ProjectConversationRead_blockedConversationId_key"
    ON "ProjectConversationRead"("blockedConversationId");
CREATE UNIQUE INDEX "ProjectConversationRead_conversationId_messageId_provider_key"
    ON "ProjectConversationRead"("conversationId", "messageId", "provider");
