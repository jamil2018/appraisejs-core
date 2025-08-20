/*
  Warnings:

  - You are about to drop the column `moduleId` on the `TemplateStepGroup` table. All the data in the column will be lost.
  - Made the column `templateStepGroupId` on table `TemplateStep` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "TemplateStepGroup" DROP CONSTRAINT "TemplateStepGroup_moduleId_fkey";

-- AlterTable
ALTER TABLE "TemplateStep" ALTER COLUMN "templateStepGroupId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TemplateStepGroup" DROP COLUMN "moduleId";
