/*
  Warnings:

  - Added the required column `moduleId` to the `Locator` table without a default value. This is not possible if the table is not empty.
  - Added the required column `moduleId` to the `TestSuite` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Locator" ADD COLUMN     "moduleId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "moduleId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locator" ADD CONSTRAINT "Locator_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
