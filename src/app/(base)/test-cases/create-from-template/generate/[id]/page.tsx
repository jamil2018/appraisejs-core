import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case From Template',
  description: 'Create a new test from a template to execute against your application',
}

const GenerateTestCaseFromTemplate = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  redirect(`/test-cases/create-from-template?templateTestCaseId=${encodeURIComponent(id)}`)
}

export default GenerateTestCaseFromTemplate
