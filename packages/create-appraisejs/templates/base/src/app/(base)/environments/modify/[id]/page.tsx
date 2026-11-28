import { getEnvironmentByIdAction, updateEnvironmentAction } from '@/actions/environments/environment-actions'
import EnvironmentForm from '../../environment-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Metadata } from 'next'
import { requireActiveProject } from '@/lib/active-project'
import { getEnvironmentTableRows } from '../../environment-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Environment',
  description: 'Update the environment configuration',
}

function optionalField(value: string | null) {
  return value || ''
}

const ModifyEnvironment = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ project?: string }>
}) => {
  const project = await requireActiveProject((await searchParams)?.project)
  const { id } = await params
  const { data: environmentToBeEditedData, error: environmentToBeEditedError } = await getEnvironmentByIdAction(id)

  if (environmentToBeEditedError) {
    return <div>Error: {environmentToBeEditedError}</div>
  }

  const [environmentData] = getEnvironmentTableRows([environmentToBeEditedData])
  if (!environmentData) {
    return <div>Error: Environment data is unavailable.</div>
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>Modify Environment</PageHeader>
        <HeaderSubtitle>Update the environment configuration.</HeaderSubtitle>
      </div>
      <EnvironmentForm
        projectId={project.id}
        id={id}
        defaultValues={{
          name: environmentData.name,
          baseUrl: environmentData.baseUrl,
          expectedPageTitle: optionalField(environmentData.expectedPageTitle),
          apiBaseUrl: optionalField(environmentData.apiBaseUrl),
          username: optionalField(environmentData.username),
          passwordEnvironmentVariable: optionalField(environmentData.passwordEnvironmentVariable),
          discoveryAuthTransitPolicyJson: optionalField(environmentData.discoveryAuthTransitPolicyJson),
        }}
        successTitle="Environment updated"
        successMessage="Environment updated successfully"
        onSubmitAction={updateEnvironmentAction}
      />
    </div>
  )
}

export default ModifyEnvironment
