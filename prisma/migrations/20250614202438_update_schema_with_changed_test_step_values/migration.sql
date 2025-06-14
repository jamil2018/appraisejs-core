/*
  Warnings:

  - You are about to drop the column `templateStepId` on the `TestCaseStep` table. All the data in the column will be lost.
  - Added the required column `gherkinStep` to the `TestCaseStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `icon` to the `TestCaseStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `TestCaseStep` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TestCaseStep" DROP CONSTRAINT "TestCaseStep_templateStepId_fkey";

-- AlterTable
ALTER TABLE "TestCaseStep" DROP COLUMN "templateStepId",
ADD COLUMN     "gherkinStep" TEXT NOT NULL,
ADD COLUMN     "icon" "TemplateStepIcon" NOT NULL,
ADD COLUMN     "label" TEXT NOT NULL;
