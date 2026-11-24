import { z } from 'zod'
import { namedProjectRecord } from '@/lib/collection-record'
import type { Tag } from '@prisma/client'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

import TagTable from './tag-table'

export const metadata: Metadata = {
  title: 'Appraise | Tags',
  description: 'Manage tags for categorizing test cases and test runs',
}

const rowSchema = namedProjectRecord.extend({ tagExpression: z.string() })

function isTag(value: unknown): value is Tag {
  return rowSchema.safeParse(value).success
}

export default async function Tags() {
  const { data, error } = await getAllTagsAction()
  const rows = Array.isArray(data) ? data.filter(isTag) : []

  if (error) return <div role="alert">Error: {error}</div>

  return (
    <div className="min-w-0 space-y-4">
      <CollectionHeader title="Tags">
        <Button render={<Link href="/tags/create" />} nativeButton={false}>
          <Plus aria-hidden="true" /> New tag
        </Button>
      </CollectionHeader>
      {rows.length === 0 ? <CollectionEmpty title="No tags yet" /> : <TagTable rows={rows} />}
    </div>
  )
}
