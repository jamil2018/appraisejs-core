PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProjectConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "initialIdempotencyKey" TEXT,
    "nextOrdinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "readProvider" TEXT NOT NULL DEFAULT 'LOCAL'
        CHECK ("readProvider" IN ('LOCAL', 'CHATGPT', 'CLAUDE', 'CURSOR')),
    "chatGptEngine" TEXT NOT NULL DEFAULT 'RESPONSES'
        CHECK ("chatGptEngine" IN ('RESPONSES', 'CODEX')),
    CONSTRAINT "ProjectConversation_targetProjectId_fkey" FOREIGN KEY ("targetProjectId")
        REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ProjectConversation" (
    "id", "targetProjectId", "title", "initialIdempotencyKey", "nextOrdinal", "createdAt", "updatedAt",
    "readProvider", "chatGptEngine"
)
SELECT
    "id", "targetProjectId", "title", "initialIdempotencyKey", "nextOrdinal", "createdAt", "updatedAt",
    "readProvider", "chatGptEngine"
FROM "ProjectConversation";

DROP TABLE "ProjectConversation";
ALTER TABLE "new_ProjectConversation" RENAME TO "ProjectConversation";
CREATE INDEX "ProjectConversation_targetProjectId_updatedAt_id_idx"
    ON "ProjectConversation"("targetProjectId", "updatedAt", "id");
CREATE UNIQUE INDEX "ProjectConversation_targetProjectId_initialIdempotencyKey_key"
    ON "ProjectConversation"("targetProjectId", "initialIdempotencyKey");

CREATE TABLE "new_ProjectConversationRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "blockedConversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "settledAt" DATETIME,
    "releasedAt" DATETIME,
    "recordsJson" TEXT,
    "engine" TEXT NOT NULL DEFAULT 'RESPONSES',
    CONSTRAINT "ProjectConversationRead_message_fkey" FOREIGN KEY ("conversationId", "messageId")
        REFERENCES "ProjectConversationMessage"("conversationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectConversationRead_provider_engine_check" CHECK (
        ("provider" = 'CHATGPT' AND "engine" IN ('RESPONSES', 'CODEX'))
        OR ("provider" = 'CLAUDE' AND "engine" = 'CLAUDE_CODE')
        OR ("provider" = 'CURSOR' AND "engine" = 'CURSOR_CLI')
    ),
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

INSERT INTO "new_ProjectConversationRead" (
    "id", "conversationId", "messageId", "provider", "state", "blockedConversationId", "createdAt",
    "expiresAt", "settledAt", "releasedAt", "recordsJson", "engine"
)
SELECT
    "id", "conversationId", "messageId", "provider", "state", "blockedConversationId", "createdAt",
    "expiresAt", "settledAt", "releasedAt", "recordsJson", "engine"
FROM "ProjectConversationRead";

DROP TABLE "ProjectConversationRead";
ALTER TABLE "new_ProjectConversationRead" RENAME TO "ProjectConversationRead";
CREATE UNIQUE INDEX "ProjectConversationRead_blockedConversationId_key"
    ON "ProjectConversationRead"("blockedConversationId");
CREATE UNIQUE INDEX "ProjectConversationRead_conversationId_messageId_provider_key"
    ON "ProjectConversationRead"("conversationId", "messageId", "provider");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
