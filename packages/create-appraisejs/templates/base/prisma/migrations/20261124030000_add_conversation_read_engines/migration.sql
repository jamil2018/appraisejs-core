ALTER TABLE "ProjectConversation" ADD COLUMN "chatGptEngine" TEXT NOT NULL DEFAULT 'RESPONSES'
    CHECK ("chatGptEngine" IN ('RESPONSES', 'CODEX'));

ALTER TABLE "ProjectConversationRead" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'RESPONSES'
    CHECK ("engine" IN ('RESPONSES', 'CODEX'));
