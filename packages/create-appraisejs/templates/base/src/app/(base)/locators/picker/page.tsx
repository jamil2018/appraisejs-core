import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

export const metadata: Metadata = {
  title: 'Appraise | Locator Picker',
  description: 'Opens the locator workspace to pick or create locators.',
}

const LocatorPickerPage = async ({ searchParams }: { searchParams?: Promise<{ project?: string }> }) => {
  const project = await requireActiveProject((await searchParams)?.project)
  redirect(withProjectScope('/locators/create', project.id))
}

export default LocatorPickerPage
