-- CreateTable
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    CONSTRAINT "TestSuite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkedJiraTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "jiraTicketId" TEXT NOT NULL,
    "jiraTicketUrl" TEXT NOT NULL,
    "jiraStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LinkedJiraTicket_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "signature" TEXT NOT NULL,
    "functionDefinition" TEXT,
    "type" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "templateStepGroupId" TEXT NOT NULL,
    CONSTRAINT "TemplateStep_templateStepGroupId_fkey" FOREIGN KEY ("templateStepGroupId") REFERENCES "TemplateStepGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateStepParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "TemplateStepParameter_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateStepGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TestCaseStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "gherkinStep" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    CONSTRAINT "TestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCaseStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateTestCaseStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL,
    "gherkinStep" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "templateTestCaseId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    CONSTRAINT "TemplateTestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateTestCaseStep_templateTestCaseId_fkey" FOREIGN KEY ("templateTestCaseId") REFERENCES "TemplateTestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateTestCaseStepParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "testCaseStepId" TEXT NOT NULL,
    "locatorId" TEXT,
    "type" TEXT NOT NULL,
    "defaultLocatorId" TEXT,
    CONSTRAINT "TemplateTestCaseStepParameter_defaultLocatorId_fkey" FOREIGN KEY ("defaultLocatorId") REFERENCES "Locator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TemplateTestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TemplateTestCaseStep" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCaseStepParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "testCaseStepId" TEXT NOT NULL,
    "locatorId" TEXT,
    "type" TEXT NOT NULL,
    CONSTRAINT "TestCaseStepParameter_locatorId_fkey" FOREIGN KEY ("locatorId") REFERENCES "Locator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TestCaseStep" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Locator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "locatorGroupId" TEXT,
    CONSTRAINT "Locator_locatorGroupId_fkey" FOREIGN KEY ("locatorGroupId") REFERENCES "LocatorGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocatorGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '/',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    CONSTRAINT "LocatorGroup_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRunTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT NOT NULL DEFAULT 'UNTESTED',
    CONSTRAINT "TestRunTestCase_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRunTestCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "updatedAt" DATETIME NOT NULL,
    "environmentId" TEXT NOT NULL,
    "testWorkersCount" INTEGER DEFAULT 1,
    "browserEngine" TEXT NOT NULL DEFAULT 'CHROMIUM',
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_TestSuiteTestCases" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TestSuiteTestCases_A_fkey" FOREIGN KEY ("A") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TestSuiteTestCases_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TagToTestRun" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TagToTestRun_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TagToTestRun_B_fkey" FOREIGN KEY ("B") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LocatorGroup_name_key" ON "LocatorGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_name_key" ON "Environment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_TestSuiteTestCases_AB_unique" ON "_TestSuiteTestCases"("A", "B");

-- CreateIndex
CREATE INDEX "_TestSuiteTestCases_B_index" ON "_TestSuiteTestCases"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TagToTestRun_AB_unique" ON "_TagToTestRun"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToTestRun_B_index" ON "_TagToTestRun"("B");
