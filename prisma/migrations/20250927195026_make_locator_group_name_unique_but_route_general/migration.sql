/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `LocatorGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "LocatorGroup_route_key";

-- CreateIndex
CREATE UNIQUE INDEX "LocatorGroup_name_key" ON "LocatorGroup"("name");
