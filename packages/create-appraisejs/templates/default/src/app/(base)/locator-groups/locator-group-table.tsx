import { deleteLocatorGroupAction, getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { DataTable } from '@/components/ui/data-table'
import { LocatorGroup, Module } from '@prisma/client'
import { locatorGroupTableCols } from './locator-group-table-columns'

const LocatorGroupTable = async () => {
  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()

  if (locatorGroupsError) {
    return <div>Error: {locatorGroupsError}</div>
  }

  return (
    <>
      <DataTable
        columns={locatorGroupTableCols}
        data={locatorGroups as (LocatorGroup & { module: Module })[]}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/locator-groups/create"
        modifyLink="/locator-groups/modify"
        deleteAction={deleteLocatorGroupAction}
      />
    </>
  )
}

export default LocatorGroupTable
