import React from 'react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '../ui/empty'
import { Button } from '../ui/button'
import Link from 'next/link'
import { SquarePen } from 'lucide-react'

const EmptyState = ({
  icon,
  title,
  description,
  createRoute,
  createText,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  createRoute: string
  createText: string
  children?: React.ReactNode
}) => {
  return (
    <Empty className="gap-4 rounded-xl border border-border bg-card p-4 sm:p-6 md:p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon" aria-hidden="true">
          {icon}
        </EmptyMedia>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-none flex-wrap justify-center gap-2 sm:flex-row">
        <Button render={<Link href={createRoute} />} nativeButton={false}>
          <SquarePen aria-hidden="true" className="size-4" />
          {createText}
        </Button>
        {children}
      </EmptyContent>
    </Empty>
  )
}

export default EmptyState
