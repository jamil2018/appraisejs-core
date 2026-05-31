import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import { type PackageManager } from './project.js'
import { type TemplateStepInstallPayload } from './types.js'

export async function writePayloadToTempFile(payload: TemplateStepInstallPayload): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appraisejs-step-payload-'))
  const filePath = path.join(tempDir, 'payload.json')
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  return filePath
}

export async function removeTempPayloadFile(filePath: string): Promise<void> {
  await fs.rm(path.dirname(filePath), { recursive: true, force: true })
}

function getRunArgs(
  packageManager: PackageManager,
  payloadFile: string,
  overwrite: boolean,
  dryRun: boolean,
): string[] {
  const payloadArgs = ['--payload-file', payloadFile]
  if (overwrite) {
    payloadArgs.push('--overwrite')
  }
  if (dryRun) {
    payloadArgs.push('--dry-run')
  }

  if (packageManager === 'yarn') {
    return ['run', 'appraisejs:install-step', ...payloadArgs]
  }

  return ['run', 'appraisejs:install-step', '--', ...payloadArgs]
}

export async function runLocalInstaller(
  packageManager: PackageManager,
  cwd: string,
  payloadFile: string,
  overwrite: boolean,
  dryRun: boolean,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(packageManager, getRunArgs(packageManager, payloadFile, overwrite, dryRun), {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${packageManager} run appraisejs:install-step exited with code ${code}`))
    })
  })
}
