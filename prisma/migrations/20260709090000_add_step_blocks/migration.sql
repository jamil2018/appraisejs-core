CREATE TABLE "StepBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "intent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "StepBlockStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepBlockId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "parameterMap" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "StepBlockStep_stepBlockId_fkey" FOREIGN KEY ("stepBlockId") REFERENCES "StepBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StepBlockStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StepBlockStep_stepBlockId_order_key" ON "StepBlockStep"("stepBlockId", "order");
