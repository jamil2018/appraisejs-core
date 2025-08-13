/*
  Warnings:

  - You are about to drop the `TestRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TestRunTestCase` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TestRun" DROP CONSTRAINT "TestRun_testSuiteId_fkey";

-- DropForeignKey
ALTER TABLE "TestRunTestCase" DROP CONSTRAINT "TestRunTestCase_testCaseId_fkey";

-- DropForeignKey
ALTER TABLE "TestRunTestCase" DROP CONSTRAINT "TestRunTestCase_testRunId_fkey";

-- DropTable
DROP TABLE "TestRun";

-- DropTable
DROP TABLE "TestRunTestCase";

-- DropEnum
DROP TYPE "TestRunStatus";
