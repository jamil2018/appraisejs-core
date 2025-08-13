/*
  Warnings:

  - You are about to drop the column `createdBy` on the `Review` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `TemplateTestCase` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `TestCase` table. All the data in the column will be lost.
  - You are about to drop the column `executedBy` on the `TestRun` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `TestSuite` table. All the data in the column will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateTestCase" DROP CONSTRAINT "TemplateTestCase_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "TestRun" DROP CONSTRAINT "TestRun_executedBy_fkey";

-- DropForeignKey
ALTER TABLE "TestSuite" DROP CONSTRAINT "TestSuite_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "createdBy";

-- AlterTable
ALTER TABLE "TemplateTestCase" DROP COLUMN "createdBy";

-- AlterTable
ALTER TABLE "TestCase" DROP COLUMN "createdBy";

-- AlterTable
ALTER TABLE "TestRun" DROP COLUMN "executedBy";

-- AlterTable
ALTER TABLE "TestSuite" DROP COLUMN "createdBy";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "UserRole";
