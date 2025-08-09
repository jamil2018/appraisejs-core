import { DataTable } from "@/components/ui/data-table";
import { Module } from "@prisma/client";
import {
  getAllModulesAction,
  deleteModuleAction,
} from "@/actions/modules/module-actions";
import { moduleTableCols } from "./module-table-columns";

const ModuleTable = async () => {
  const { data: modules } = await getAllModulesAction();

  return (
    <>
      <DataTable
        columns={moduleTableCols}
        data={modules as (Module & { parent: { name: string } })[]}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/modules/create"
        modifyLink="/modules/modify"
        deleteAction={deleteModuleAction}
      />
    </>
  );
};

export default ModuleTable;
