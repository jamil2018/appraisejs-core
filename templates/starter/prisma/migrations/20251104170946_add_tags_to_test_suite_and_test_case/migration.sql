-- CreateTable
CREATE TABLE "_TagToTestSuite" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TagToTestSuite_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TagToTestSuite_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TagToTestCase" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TagToTestCase_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TagToTestCase_B_fkey" FOREIGN KEY ("B") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_TagToTestSuite_AB_unique" ON "_TagToTestSuite"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToTestSuite_B_index" ON "_TagToTestSuite"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TagToTestCase_AB_unique" ON "_TagToTestCase"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToTestCase_B_index" ON "_TagToTestCase"("B");
