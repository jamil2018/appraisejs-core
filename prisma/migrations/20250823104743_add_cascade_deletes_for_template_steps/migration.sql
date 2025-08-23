-- DropForeignKey
ALTER TABLE "TemplateStepParameter" DROP CONSTRAINT "TemplateStepParameter_templateStepId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateTestCaseStep" DROP CONSTRAINT "TemplateTestCaseStep_templateStepId_fkey";

-- DropForeignKey
ALTER TABLE "TestCaseStep" DROP CONSTRAINT "TestCaseStep_templateStepId_fkey";

-- AddForeignKey
ALTER TABLE "TemplateStepParameter" ADD CONSTRAINT "TemplateStepParameter_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseStep" ADD CONSTRAINT "TestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStep" ADD CONSTRAINT "TemplateTestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
