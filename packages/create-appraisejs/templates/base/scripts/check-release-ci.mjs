import { readFile } from 'node:fs/promises'
import YAML from 'yaml'

const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'))
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
const rootAppraisejsInstallIndex = rootCommands.indexOf('npm --prefix packages/appraisejs ci')
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

const dependabot = YAML.parse(await readFile('.github/dependabot.yml', 'utf8'))
const npmDirectories = dependabot.updates
  .filter(update => update['package-ecosystem'] === 'npm')
  .map(update => update.directory)
for (const directory of ['/', '/packages/appraisejs', '/packages/create-appraisejs']) {
  if (!npmDirectories.includes(directory)) throw new Error(`Dependabot does not cover ${directory}.`)
}
console.log('Release CI and dependency-update configuration are structurally complete.')
