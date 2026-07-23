import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

// Exhaustive release-contract validator; branch count intentionally mirrors independent policy failures.
// fallow-ignore-next-line complexity
export function validateReleaseCiWorkflow(workflow, dependabot) {
  if (workflow.env?.NODE_VERSION !== 22) {
    throw new Error('Release CI must use Node 22, the documented release runtime.')
  }
  const pullRequestBranches = workflow.on?.pull_request?.branches ?? []
  const requiredJobs = [
    'root-app',
    'appraisejs-package',
    'create-appraisejs-package',
    'security-and-quality',
    'dependency-and-package-content',
  ]
  if (!pullRequestBranches.includes('appraise-0.5')) throw new Error('CI must run for pull requests to appraise-0.5.')
  for (const job of requiredJobs) if (!workflow.jobs?.[job]) throw new Error(`Release CI is missing the ${job} job.`)
  const aggregateNeeds = workflow.jobs?.['release-check']?.needs ?? []
  for (const job of requiredJobs)
    if (!aggregateNeeds.includes(job)) throw new Error(`Release check does not require ${job}.`)

  const rootCommands = (workflow.jobs?.['root-app']?.steps ?? [])
    .map(step => step.run)
    .filter(command => typeof command === 'string')
  const browserInstallIndex = rootCommands.indexOf('npx playwright install --with-deps chromium')
  const unitValidationIndex = rootCommands.indexOf('npm run validate:unit')
  if (browserInstallIndex === -1 || unitValidationIndex === -1 || browserInstallIndex > unitValidationIndex) {
    throw new Error('Root CI must install Chromium before running browser-backed unit validation.')
  }
  const rootInstallIndex = rootCommands.indexOf('npm ci')
  const rootAppraisejsInstallIndex = rootCommands.indexOf('npm --prefix packages/appraisejs ci')
  const harnessCheckIndex = rootCommands.indexOf('npm run check:harness')
  const prismaGenerateIndex = rootCommands.indexOf('npx prisma generate')
  if (
    harnessCheckIndex === -1 ||
    rootInstallIndex === -1 ||
    rootAppraisejsInstallIndex === -1 ||
    prismaGenerateIndex === -1 ||
    harnessCheckIndex < rootInstallIndex ||
    harnessCheckIndex < rootAppraisejsInstallIndex ||
    harnessCheckIndex > prismaGenerateIndex
  ) {
    throw new Error(
      'Root CI must run the harness check after root/package dependency installation and before Prisma and validation gates.',
    )
  }
  const rootBuildIndex = rootCommands.indexOf('npm run build')
  if (rootAppraisejsInstallIndex === -1 || rootBuildIndex === -1 || rootAppraisejsInstallIndex > rootBuildIndex) {
    throw new Error('Root CI must install appraisejs package dependencies before the aggregate build.')
  }

  const createPackageCommands = (workflow.jobs?.['create-appraisejs-package']?.steps ?? [])
    .map(step => step.run)
    .filter(command => typeof command === 'string')
  if (createPackageCommands[0] !== 'npm ci') {
    throw new Error('create-appraisejs CI must install root dependencies before preparing the canonical root template.')
  }
  for (const command of [
    'npm --prefix packages/create-appraisejs ci',
    'npm --prefix packages/create-appraisejs test',
    'npm --prefix packages/create-appraisejs run build',
  ]) {
    if (!createPackageCommands.includes(command)) throw new Error(`create-appraisejs CI is missing: ${command}`)
  }

  const securityCommands = (workflow.jobs?.['security-and-quality']?.steps ?? [])
    .map(step => step.run)
    .filter(command => typeof command === 'string')
  const appraisejsInstallIndex = securityCommands.indexOf('npm --prefix packages/appraisejs ci')
  const mcpHttpCheckIndex = securityCommands.indexOf('npm run release:check:mcp-http')
  if (appraisejsInstallIndex === -1 || mcpHttpCheckIndex === -1 || appraisejsInstallIndex > mcpHttpCheckIndex) {
    throw new Error('Security CI must install appraisejs package dependencies before running MCP HTTP checks.')
  }

  const npmDirectories = dependabot.updates
    .filter(update => update['package-ecosystem'] === 'npm')
    .map(update => update.directory)
  for (const directory of ['/', '/packages/appraisejs', '/packages/create-appraisejs']) {
    if (!npmDirectories.includes(directory)) throw new Error(`Dependabot does not cover ${directory}.`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'))
  const dependabot = YAML.parse(await readFile('.github/dependabot.yml', 'utf8'))
  validateReleaseCiWorkflow(workflow, dependabot)
  console.log('Release CI and dependency-update configuration are structurally complete.')
}
