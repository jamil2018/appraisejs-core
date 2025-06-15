import {
  deleteTestCaseAction,
  getAllTestCasesAction,
} from "@/actions/test-case/test-case-actions";
import { DataTable } from "@/components/ui/data-table";
import { TestCase, TestCaseStep } from "@prisma/client";
import { testCaseTableCols } from "./test-case-table-columns";

export default async function TestCaseTable() {
  const { data: testCases } = await getAllTestCasesAction();

  return (
    <>
      <DataTable
        columns={testCaseTableCols}
        data={testCases as (TestCase & { steps: TestCaseStep[] })[]}
        filterColumn="title"
        filterPlaceholder="Filter by title..."
        createLink="/test-cases/create"
        modifyLink="/test-cases/modify"
        deleteAction={deleteTestCaseAction}
      />
    </>
  );
}
