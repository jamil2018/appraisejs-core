import { z } from 'zod'
import { namedProjectRecord } from '@/lib/collection-record'
import type { TemplateTestCase, TemplateTestCaseStep } from '@prisma/client'
import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { presentationVocabulary } from '@/lib/presentation-vocabulary'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

import TemplateTestCaseTable from './template-test-case-table'

type TemplateTestCaseWithSteps = TemplateTestCase & { steps: TemplateTestCaseStep[] }

const rowSchema = namedProjectRecord.extend({ steps: z.array(z.unknown()) })

function isTemplateTestCaseWithSteps(value: unknown): value is TemplateTestCaseWithSteps {
  return rowSchema.safeParse(value).success
}

export const metadata: Metadata = {
  title: `Appraise | ${presentationVocabulary.caseTemplate.plural}`,
  description: 'Manage reusable Case Templates for quickly creating test cases',
}

export default async function TemplateTestCasesPage() {
  const { data, error } = await getAllTemplateTestCasesAction()
  const rows = Array.isArray(data) ? data.filter(isTemplateTestCaseWithSteps) : []

  if (error) return <div role="alert">Error: {error}</div>

  return (
    <div className="min-w-0 space-y-4">
      <CollectionHeader title={presentationVocabulary.caseTemplate.plural}>
        <Button render={<Link href="/template-test-cases/create" />} nativeButton={false}>
          <Plus aria-hidden="true" /> New case template
        </Button>
      </CollectionHeader>
      {rows.length === 0 ? <CollectionEmpty title="No case templates yet" /> : <TemplateTestCaseTable rows={rows} />}
    </div>
  )
}
