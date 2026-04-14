import { DataTable } from '@/components/ui/data-table'
import { getAllEnvironmentsAction, deleteEnvironmentAction } from '@/actions/environments/environment-actions'
import { environmentTableCols } from './environment-table-columns'
import { getEnvironmentTableRows } from './environment-helpers'

const EnvironmentTable = async () => {
  const { data: environments } = await getAllEnvironmentsAction()
  const environmentRows = getEnvironmentTableRows(environments)

  return (
    <>
      <DataTable
        columns={environmentTableCols}
        data={environmentRows}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/environments/create"
        modifyLink="/environments/modify"
        deleteAction={deleteEnvironmentAction}
      />
    </>
  )
}

export default EnvironmentTable
