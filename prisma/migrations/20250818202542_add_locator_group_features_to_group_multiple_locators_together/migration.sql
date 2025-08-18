-- DropForeignKey
ALTER TABLE "Locator" DROP CONSTRAINT "Locator_moduleId_fkey";

-- AlterTable
ALTER TABLE "Locator" ADD COLUMN     "locatorGroupId" TEXT;

-- CreateTable
CREATE TABLE "LocatorGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "LocatorGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Locator" ADD CONSTRAINT "Locator_locatorGroupId_fkey" FOREIGN KEY ("locatorGroupId") REFERENCES "LocatorGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocatorGroup" ADD CONSTRAINT "LocatorGroup_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
