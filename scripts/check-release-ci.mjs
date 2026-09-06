import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const requiredJobs = [
  'root-app',
  'appraisejs-package',
  'create-appraisejs-package',
  'security-and-quality',
  'dependency-and-package-content',
]

function commandsFor(workflow, job) {
  return (workflow.jobs?.[job]?.steps ?? []).map(step => step.run).filter(command => typeof command === 'string')
}

function requireCommand(commands, command, message) {
  if (!commands.includes(command)) throw new Error(message ?? `Release CI is missing: ${command}`)
}

function validateRequiredJobs(workflow) {
  validatePullRequestBranch(workflow)
  validateDefinedJobs(workflow)
  validateAggregateJobs(workflow)
}

function validatePullRequestBranch(workflow) {
  if (!(workflow.on?.pull_request?.branches ?? []).includes('appraise-0.5')) {
    throw new Error('CI must run for pull requests to appraise-0.5.')
  }
}

function validateDefinedJobs(workflow) {
  const missingJob = requiredJobs.find(job => !workflow.jobs?.[job])
  if (missingJob) throw new Error(`Release CI is missing the ${missingJob} job.`)
}

function validateAggregateJobs(workflow) {
  const aggregateNeeds = workflow.jobs?.['release-check']?.needs ?? []
  const unrequiredJob = requiredJobs.find(job => !aggregateNeeds.includes(job))
  if (unrequiredJob) throw new Error(`Release check does not require ${unrequiredJob}.`)
}

function commandIndex(commands, command, error) {
  const index = commands.indexOf(command)
  if (index === -1) throw new Error(error)
  return index
}

function requireBefore(commands, first, second, error) {
  if (commandIndex(commands, first, error) > commandIndex(commands, second, error)) throw new Error(error)
}

function validateRootCommands(workflow) {
  const commands = commandsFor(workflow, 'root-app')
  requireBefore(
    commands,
    'npx playwright install --with-deps chromium',
    'npm run validate:unit',
    'Root CI must install Chromium before running browser-backed unit validation.',
  )
  const harnessError =
    'Root CI must run the harness check after root/package dependency installation and before Prisma and validation gates.'
  requireBefore(commands, 'npm ci', 'npm run check:harness', harnessError)
  requireBefore(commands, 'npm --prefix packages/appraisejs ci', 'npm run check:harness', harnessError)
  requireBefore(commands, 'npm run check:harness', 'npx prisma generate', harnessError)
  requireBefore(
    commands,
    'npm --prefix packages/appraisejs ci',
    'npm run build',
    'Root CI must install appraisejs package dependencies before the aggregate build.',
  )
}

function validatePackageCommands(workflow) {
  const commands = commandsFor(workflow, 'create-appraisejs-package')
  if (commands[0] !== 'npm ci')
    throw new Error('create-appraisejs CI must install root dependencies before preparing the canonical root template.')
  for (const command of [
    'npm --prefix packages/create-appraisejs ci',
    'npm --prefix packages/create-appraisejs test',
    'npm --prefix packages/create-appraisejs run build',
  ])
    requireCommand(commands, command)
}

function validateSecurityCommands(workflow) {
  const commands = commandsFor(workflow, 'security-and-quality')
  const packageInstallIndex = commands.indexOf('npm --prefix packages/appraisejs ci')
  const mcpHttpCheckIndex = commands.indexOf('npm run release:check:mcp-http')
  if (packageInstallIndex === -1 || mcpHttpCheckIndex === -1 || packageInstallIndex > mcpHttpCheckIndex) {
    throw new Error('Security CI must install appraisejs package dependencies before running MCP HTTP checks.')
  }
  requireCommand(
    commands,
    'npm run release:check:capsule-cutover',
    'Security CI must enforce the capsule-only cutover guard.',
  )
}

function validateDependabot(dependabot) {
  const npmDirectories = dependabot.updates
    .filter(update => update['package-ecosystem'] === 'npm')
    .map(update => update.directory)
  for (const directory of ['/', '/packages/appraisejs', '/packages/create-appraisejs']) {
    if (!npmDirectories.includes(directory)) throw new Error(`Dependabot does not cover ${directory}.`)
  }
}

export function validateReleaseCiWorkflow(workflow, dependabot) {
  if (workflow.env?.NODE_VERSION !== 22) {
    throw new Error('Release CI must use Node 22, the documented release runtime.')
  }
  validateRequiredJobs(workflow)
  validateRootCommands(workflow)
  validatePackageCommands(workflow)
  validateSecurityCommands(workflow)
  validateDependabot(dependabot)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'))
  const dependabot = YAML.parse(await readFile('.github/dependabot.yml', 'utf8'))
  validateReleaseCiWorkflow(workflow, dependabot)
  console.log('Release CI and dependency-update configuration are structurally complete.')
}
