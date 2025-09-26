/*
  Warnings:

  - A unique constraint covering the columns `[route]` on the table `LocatorGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LocatorGroup" ADD COLUMN     "route" TEXT NOT NULL DEFAULT '/';

-- CreateIndex
CREATE UNIQUE INDEX "LocatorGroup_route_key" ON "LocatorGroup"("route");
