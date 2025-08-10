-- DropForeignKey
ALTER TABLE "Locator" DROP CONSTRAINT "Locator_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "Module" DROP CONSTRAINT "Module_parentId_fkey";

-- DropForeignKey
ALTER TABLE "TestSuite" DROP CONSTRAINT "TestSuite_moduleId_fkey";

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locator" ADD CONSTRAINT "Locator_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
