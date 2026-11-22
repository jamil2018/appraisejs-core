import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Code } from 'lucide-react'
import ModuleTable from './module-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { getModuleTableRows } from './module-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modules',
  description: 'Manage application modules and their configurations',
}

const Modules = async () => {
  const { data: modules, error: modulesError } = await getAllModulesAction()

  if (modulesError) {
    return <div>Error: {modulesError}</div>
  }

  const modulesData = getModuleTableRows(modules)

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Code className="size-7 shrink-0 sm:size-8" />
            Modules
          </span>
        </PageHeader>
        <HeaderSubtitle>Modules are the components that are used to build the application</HeaderSubtitle>
      </div>
      {!modulesData || modulesData.length === 0 ? (
        <EmptyState
          icon={<Code className="size-5" />}
          title="No modules found"
          description="Get started by creating a module to organize your application components"
          createRoute="/modules/create"
          createText="Create Module"
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <ModuleTable />
        </Suspense>
      )}
    </div>
  )
}

export default Modules
