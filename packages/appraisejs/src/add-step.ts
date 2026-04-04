import { downloadStepPayload, fetchRegistryManifest, resolveStepEntry } from './registry.js'
import { runLocalInstaller, removeTempPayloadFile, writePayloadToTempFile } from './installer.js'
import { validateAppraiseProject } from './project.js'
import { type AddStepOptions } from './types.js'

export type AddStepDependencies = {
  fetchRegistryManifest: typeof fetchRegistryManifest
  downloadStepPayload: typeof downloadStepPayload
  resolveStepEntry: typeof resolveStepEntry
  validateAppraiseProject: typeof validateAppraiseProject
  writePayloadToTempFile: typeof writePayloadToTempFile
  runLocalInstaller: typeof runLocalInstaller
  removeTempPayloadFile: typeof removeTempPayloadFile
  log(message: string): void
}

const defaultDependencies: AddStepDependencies = {
  fetchRegistryManifest,
  downloadStepPayload,
  resolveStepEntry,
  validateAppraiseProject,
  writePayloadToTempFile,
  runLocalInstaller,
  removeTempPayloadFile,
  log: message => console.log(message),
}

export async function addStepBySlug(
  slug: string,
  options: AddStepOptions,
  dependencies: AddStepDependencies = defaultDependencies,
): Promise<void> {
  const project = await dependencies.validateAppraiseProject(options.cwd)
  const { manifest, manifestUrl } = await dependencies.fetchRegistryManifest(options.branch, options.registryUrl)
  const entry = dependencies.resolveStepEntry(manifest, slug)
  const payload = await dependencies.downloadStepPayload(manifestUrl, entry)

  const payloadFile = await dependencies.writePayloadToTempFile(payload)

  try {
    dependencies.log(`Installing ${entry.slug} into ${project.root}`)
    await dependencies.runLocalInstaller(
      project.packageManager,
      project.root,
      payloadFile,
      options.overwrite,
      options.dryRun,
    )
  } finally {
    await dependencies.removeTempPayloadFile(payloadFile)
  }
}
