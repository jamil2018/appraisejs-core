import { getEnvironmentByIdAction, updateEnvironmentAction } from '@/actions/environments/environment-actions'
import { Environment } from '@prisma/client'
import EnvironmentForm from '../../environment-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'

const ModifyEnvironment = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: environmentToBeEditedData, error: environmentToBeEditedError } = await getEnvironmentByIdAction(id)

  if (environmentToBeEditedError) {
    return <div>Error: {environmentToBeEditedError}</div>
  }

  const environmentData = environmentToBeEditedData as Environment

  return (
    <>
      <div className="mb-8">
        <PageHeader>Modify Environment</PageHeader>
        <HeaderSubtitle>Update the environment configuration.</HeaderSubtitle>
      </div>
      <EnvironmentForm
        id={id}
        defaultValues={{
          name: environmentData.name,
          baseUrl: environmentData.baseUrl,
          apiBaseUrl: environmentData.apiBaseUrl || '',
          username: environmentData.username || '',
          password: environmentData.password || '',
        }}
        successTitle="Environment updated"
        successMessage="Environment updated successfully"
        onSubmitAction={updateEnvironmentAction}
      />
    </>
  )
}

export default ModifyEnvironment
