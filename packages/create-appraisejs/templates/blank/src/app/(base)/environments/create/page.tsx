import { createEnvironmentAction } from '@/actions/environments/environment-actions'
import EnvironmentForm from '../environment-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Environment',
  description: 'Create a new environment configuration for your test runs',
}

const CreateEnvironment = async () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Environment</PageHeader>
        <HeaderSubtitle>Create a new environment configuration for your test runs.</HeaderSubtitle>
      </div>
      <EnvironmentForm
        successTitle="Environment created"
        successMessage="Environment created successfully"
        onSubmitAction={createEnvironmentAction}
      />
    </>
  )
}

export default CreateEnvironment
