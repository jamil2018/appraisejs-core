import { getAllStepBlocksAction, deleteStepBlockAction } from '@/actions/step-block/step-block-actions'
import { DataTable } from '@/components/ui/data-table'

import { getStepBlockRows } from './step-block-helpers'
import { stepBlockTableCols } from './step-block-table-columns'

const StepBlockTable = async () => {
  const { data, error } = await getAllStepBlocksAction()

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <DataTable
      columns={stepBlockTableCols}
      data={getStepBlockRows(data)}
      filterColumn="name"
      filterPlaceholder="Filter by name..."
      createLink="/step-blocks/create"
      modifyLink="/step-blocks/modify"
      deleteAction={deleteStepBlockAction}
    />
  )
}

export default StepBlockTable
