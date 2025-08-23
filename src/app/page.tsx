'use client'
import React from 'react'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const Dashboard = () => {
  return (
    <div>
      <div className="mb-8">
        <PageHeader>Dashboard</PageHeader>
        <HeaderSubtitle>Welcome to the dashboard. Here you can see your test suites and run them.</HeaderSubtitle>
      </div>
      <DataTableSkeleton />
    </div>
  )
}

export default Dashboard
