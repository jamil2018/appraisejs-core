import { deleteLocatorAction, getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { DataTable } from '@/components/ui/data-table'
import { locatorTableCols } from './locator-table-columns'
import { getLocatorTableRows } from './locator-helpers'

const LocatorTable = async () => {
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()

  if (locatorsError) {
    return <div>Error: {locatorsError}</div>
  }

  const locatorRows = getLocatorTableRows(locators)

  return (
    <>
      <DataTable
        columns={locatorTableCols}
        data={locatorRows}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/locators/create"
        modifyLink="/locators/modify"
        deleteAction={deleteLocatorAction}
      />
    </>
  )
}

export default LocatorTable
