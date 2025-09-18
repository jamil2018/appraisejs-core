-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestRunTestCaseStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestRunTestCaseResult" AS ENUM ('PASSED', 'FAILED', 'UNTESTED');

-- CreateEnum
CREATE TYPE "TestRunResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'CANCELLED');

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

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");

-- AddForeignKey
ALTER TABLE "TestRunTestCase" ADD CONSTRAINT "TestRunTestCase_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunTestCase" ADD CONSTRAINT "TestRunTestCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
