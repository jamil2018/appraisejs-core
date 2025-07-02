-- CreateTable
CREATE TABLE "TemplateTestCase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

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

-- AddForeignKey
ALTER TABLE "TemplateTestCase" ADD CONSTRAINT "TemplateTestCase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStep" ADD CONSTRAINT "TemplateTestCaseStep_templateTestCaseId_fkey" FOREIGN KEY ("templateTestCaseId") REFERENCES "TemplateTestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStep" ADD CONSTRAINT "TemplateTestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStepParameter" ADD CONSTRAINT "TemplateTestCaseStepParameter_defaultLocatorId_fkey" FOREIGN KEY ("defaultLocatorId") REFERENCES "Locator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTestCaseStepParameter" ADD CONSTRAINT "TemplateTestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TemplateTestCaseStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
