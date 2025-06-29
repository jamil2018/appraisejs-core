/*
  Warnings:

  - Added the required column `templateStepId` to the `TestCaseStep` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TestCaseStep" ADD COLUMN     "templateStepId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "TestCaseStep" ADD CONSTRAINT "TestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
