-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestRunTestCaseStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestRunTestCaseResult" AS ENUM ('PASSED', 'FAILED', 'UNTESTED');

-- CreateEnum
CREATE TYPE "TestRunResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TESTER', 'REVIEWER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TestCaseResult" AS ENUM ('PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'RETEST', 'UNTESTED');

-- CreateEnum
CREATE TYPE "TemplateStepType" AS ENUM ('ACTION', 'ASSERTION', 'FLOW_CONTROL');

-- CreateEnum
CREATE TYPE "StepParameterType" AS ENUM ('NUMBER', 'STRING', 'DATE', 'BOOLEAN', 'LOCATOR');

-- CreateEnum
CREATE TYPE "StepParameterValueType" AS ENUM ('STRING', 'NUMBER', 'LOCATOR');

-- CreateEnum
CREATE TYPE "TemplateStepIcon" AS ENUM ('MOUSE', 'NAVIGATION', 'INPUT', 'DOWNLOAD', 'API', 'STORE', 'FORMAT', 'DATA', 'UPLOAD', 'WAIT', 'VALIDATION', 'DEBUG');

-- CreateEnum
CREATE TYPE "BrowserEngine" AS ENUM ('CHROMIUM', 'FIREFOX', 'WEBKIT');

-- CreateTable
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedJiraTicket" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "jiraTicketId" TEXT NOT NULL,
    "jiraTicketUrl" TEXT NOT NULL,
    "jiraStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedJiraTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStep" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signature" TEXT NOT NULL,
    "functionDefinition" TEXT,
    "type" "TemplateStepType" NOT NULL,
    "icon" "TemplateStepIcon" NOT NULL,
    "templateStepGroupId" TEXT NOT NULL,

    CONSTRAINT "TemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStepParameter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "StepParameterType" NOT NULL,

    CONSTRAINT "TemplateStepParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStepGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateStepGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseStep" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "gherkinStep" TEXT NOT NULL,
    "icon" "TemplateStepIcon" NOT NULL,
    "label" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,

    CONSTRAINT "TestCaseStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTestCase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTestCaseStep" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "gherkinStep" TEXT NOT NULL,
    "icon" "TemplateStepIcon" NOT NULL,
    "label" TEXT NOT NULL,
    "templateTestCaseId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,

    CONSTRAINT "TemplateTestCaseStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTestCaseStepParameter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "testCaseStepId" TEXT NOT NULL,
    "locatorId" TEXT,
    "type" "StepParameterType" NOT NULL,
    "defaultLocatorId" TEXT,

    CONSTRAINT "TemplateTestCaseStepParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseStepParameter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "testCaseStepId" TEXT NOT NULL,
    "locatorId" TEXT,
    "type" "StepParameterType" NOT NULL,

    CONSTRAINT "TestCaseStepParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "locatorGroupId" TEXT,

    CONSTRAINT "Locator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocatorGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '/',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "LocatorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRunTestCase" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "status" "TestRunTestCaseStatus" NOT NULL DEFAULT 'PENDING',
    "result" "TestRunTestCaseResult" NOT NULL DEFAULT 'UNTESTED',

    CONSTRAINT "TestRunTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "TestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "result" "TestRunResult" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "environmentId" TEXT NOT NULL,
    "testWorkersCount" INTEGER DEFAULT 1,
    "browserEngine" "BrowserEngine" NOT NULL DEFAULT 'CHROMIUM',

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagExpression" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TestSuiteTestCases" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TestSuiteTestCases_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TagToTestRun" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TagToTestRun_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocatorGroup_name_key" ON "LocatorGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_name_key" ON "Environment"("name");

-- CreateIndex
CREATE INDEX "_TestSuiteTestCases_B_index" ON "_TestSuiteTestCases"("B");

-- CreateIndex
CREATE INDEX "_TagToTestRun_B_index" ON "_TagToTestRun"("B");

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedJiraTicket" ADD CONSTRAINT "LinkedJiraTicket_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStep" ADD CONSTRAINT "TemplateStep_templateStepGroupId_fkey" FOREIGN KEY ("templateStepGroupId") REFERENCES "TemplateStepGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStepParameter" ADD CONSTRAINT "TemplateStepParameter_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseStep" ADD CONSTRAINT "TestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseStep" ADD CONSTRAINT "TestCaseStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStep" ADD CONSTRAINT "TemplateTestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStep" ADD CONSTRAINT "TemplateTestCaseStep_templateTestCaseId_fkey" FOREIGN KEY ("templateTestCaseId") REFERENCES "TemplateTestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStepParameter" ADD CONSTRAINT "TemplateTestCaseStepParameter_defaultLocatorId_fkey" FOREIGN KEY ("defaultLocatorId") REFERENCES "Locator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStepParameter" ADD CONSTRAINT "TemplateTestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TemplateTestCaseStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseStepParameter" ADD CONSTRAINT "TestCaseStepParameter_locatorId_fkey" FOREIGN KEY ("locatorId") REFERENCES "Locator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseStepParameter" ADD CONSTRAINT "TestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TestCaseStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locator" ADD CONSTRAINT "Locator_locatorGroupId_fkey" FOREIGN KEY ("locatorGroupId") REFERENCES "LocatorGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocatorGroup" ADD CONSTRAINT "LocatorGroup_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunTestCase" ADD CONSTRAINT "TestRunTestCase_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunTestCase" ADD CONSTRAINT "TestRunTestCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestSuiteTestCases" ADD CONSTRAINT "_TestSuiteTestCases_A_fkey" FOREIGN KEY ("A") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestSuiteTestCases" ADD CONSTRAINT "_TestSuiteTestCases_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTestRun" ADD CONSTRAINT "_TagToTestRun_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTestRun" ADD CONSTRAINT "_TagToTestRun_B_fkey" FOREIGN KEY ("B") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
