-- AlterTable
ALTER TABLE "TemplateStep" ADD COLUMN     "templateStepGroupId" TEXT;

-- CreateTable
CREATE TABLE "TemplateStepGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "TemplateStepGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TemplateStep" ADD CONSTRAINT "TemplateStep_templateStepGroupId_fkey" FOREIGN KEY ("templateStepGroupId") REFERENCES "TemplateStepGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStepGroup" ADD CONSTRAINT "TemplateStepGroup_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
