import React from 'react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty'
import { Button } from '../ui/button'
import Link from 'next/link'

const EmptyState = ({
  icon,
  title,
  description,
  createRoute,
  createText,
}: {
  icon: React.ReactNode
  title: string
  description: string
  createRoute: string
  createText: string
}) => {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href={createRoute}>{createText}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export default EmptyState
