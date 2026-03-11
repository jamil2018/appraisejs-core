import { DataTable } from '@/components/ui/data-table'
import { Environment } from '@prisma/client'
import { getAllEnvironmentsAction, deleteEnvironmentAction } from '@/actions/environments/environment-actions'
import { environmentTableCols } from './environment-table-columns'

const EnvironmentTable = async () => {
  const { data: environments } = await getAllEnvironmentsAction()

  return (
    <>
      <DataTable
        columns={environmentTableCols}
        data={environments as Environment[]}
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
