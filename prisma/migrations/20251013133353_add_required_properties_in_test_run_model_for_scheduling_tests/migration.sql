/*
  Warnings:

  - Added the required column `environmentId` to the `TestRun` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BrowserEngine" AS ENUM ('CHROMIUM', 'FIREFOX', 'WEBKIT');

-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN     "browserEngine" "BrowserEngine" NOT NULL DEFAULT 'CHROMIUM',
ADD COLUMN     "environmentId" TEXT NOT NULL,
ADD COLUMN     "testWorkersCount" INTEGER DEFAULT 1;

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TagToTestRun" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TagToTestRun_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TagToTestRun_B_index" ON "_TagToTestRun"("B");

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTestRun" ADD CONSTRAINT "_TagToTestRun_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTestRun" ADD CONSTRAINT "_TagToTestRun_B_fkey" FOREIGN KEY ("B") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
