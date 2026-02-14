import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Code } from 'lucide-react'
import ModuleTable from './module-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Module } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Modules',
  description: 'Manage application modules and their configurations',
}

const Modules = async () => {
  const { data: modules, error: modulesError } = await getAllModulesAction()

  if (modulesError) {
    return <div>Error: {modulesError}</div>
  }

  const modulesData = modules as (Module & { parent: { name: string } })[]

  if (!modulesData || modulesData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Code className="h-8 w-8" />}
          title="No modules found"
          description="Get started by creating a module to organize your application components"
          createRoute="/modules/create"
          createText="Create Module"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Code className="mr-2 h-8 w-8" />
            Modules
          </span>
        </PageHeader>
        <HeaderSubtitle>Modules are the components that are used to build the application</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <ModuleTable />
      </Suspense>
    </>
  )
}

export default Modules
