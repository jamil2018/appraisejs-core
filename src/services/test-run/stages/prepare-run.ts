export type PrepareRunInput = Readonly<{
  prepareWorkspace: boolean
  prepareFeatureFiles: () => Promise<void>
}>

export async function prepareRun(input: PrepareRunInput): Promise<{ workspacePrepared: boolean }> {
  if (!input.prepareWorkspace) return { workspacePrepared: false }
  await input.prepareFeatureFiles()
  return { workspacePrepared: true }
}
