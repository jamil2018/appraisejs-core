import { DataTable } from '@/components/ui/data-table'
import { getAllModulesAction, deleteModuleAction } from '@/actions/modules/module-actions'
import { moduleTableCols } from './module-table-columns'
import { getModuleTableRows } from './module-helpers'

const ModuleTable = async () => {
  const { data: modules } = await getAllModulesAction()
  const moduleRows = getModuleTableRows(modules)

  return (
    <>
      <DataTable
        columns={moduleTableCols}
        data={moduleRows}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/modules/create"
        modifyLink="/modules/modify"
        deleteAction={deleteModuleAction}
      />
    </>
  )
}

export default ModuleTable
