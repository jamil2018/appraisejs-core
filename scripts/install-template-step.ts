#!/usr/bin/env tsx

import path from 'path'
import { existsSync, promises as fs } from 'fs'
import { spawn } from 'child_process'
import { installTemplateStepPayload, type TemplateStepInstallPayload } from './lib/template-step-installer'

type CliOptions = {
  payloadFile: string
  overwrite: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let payloadFile = ''
  let overwrite = false
  let dryRun = false

  for (let index = 0; index < argv.length; index++) {
    const current = argv[index]
    if (current === '--payload-file') {
      payloadFile = argv[index + 1] ?? ''
      index++
      continue
    }
    if (current === '--overwrite') {
      overwrite = true
      continue
    }
    if (current === '--dry-run') {
      dryRun = true
      continue
    }
  }

  if (!payloadFile) {
    throw new Error('Missing required --payload-file argument.')
  }

  return {
    payloadFile,
    overwrite,
    dryRun,
  }
}

function detectPackageManager(projectRoot: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.startsWith('pnpm/')) return 'pnpm'
  if (userAgent.startsWith('yarn/')) return 'yarn'
  if (userAgent.startsWith('bun/')) return 'bun'
  if (userAgent.startsWith('npm/')) return 'npm'

  if (existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(projectRoot, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function getRunArgs(packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun', scriptName: string): string[] {
  if (packageManager === 'npm' || packageManager === 'pnpm' || packageManager === 'bun') {
    return ['run', scriptName]
  }

  return ['run', scriptName]
}

async function runScript(projectRoot: string, packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun', scriptName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(packageManager, getRunArgs(packageManager, scriptName), {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${packageManager} run ${scriptName} exited with code ${code}`))
    })
  })
}

async function readPayload(payloadFile: string): Promise<TemplateStepInstallPayload> {
  const raw = await fs.readFile(payloadFile, 'utf8')
  return JSON.parse(raw) as TemplateStepInstallPayload
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()
  const payloadFile = path.resolve(projectRoot, options.payloadFile)
  const payload = await readPayload(payloadFile)

  const result = await installTemplateStepPayload(payload, {
    projectRoot,
    overwrite: options.overwrite,
    dryRun: options.dryRun,
  })

  console.log(result.reason)
  console.log(`Target file: ${path.relative(projectRoot, result.targetFilePath)}`)

  if (options.dryRun) {
    if (result.changed) {
      console.log('Dry run: would run sync-template-step-groups')
      console.log('Dry run: would run sync-template-steps')
    }
    return
  }

  if (!result.changed) {
    return
  }

  const packageManager = detectPackageManager(projectRoot)
  await runScript(projectRoot, packageManager, 'sync-template-step-groups')
  await runScript(projectRoot, packageManager, 'sync-template-steps')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
