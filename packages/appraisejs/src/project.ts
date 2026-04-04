import path from 'path'
import { existsSync, promises as fs } from 'fs'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type AppraiseProjectInfo = {
  root: string
  packageManager: PackageManager
  packageJsonPath: string
}

type PackageJsonShape = {
  scripts?: Record<string, string>
}

export async function validateAppraiseProject(projectRoot: string): Promise<AppraiseProjectInfo> {
  const root = path.resolve(projectRoot)
  const packageJsonPath = path.join(root, 'package.json')

  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${root}. Use --cwd to point at an Appraise project.`)
  }

  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as PackageJsonShape
  const scripts = pkg.scripts ?? {}

  if (!scripts['appraisejs:install-step']) {
    throw new Error(
      `The target project is missing the "appraisejs:install-step" script. Upgrade the project scaffold before using this CLI.`,
    )
  }

  if (!scripts['sync-template-step-groups'] || !scripts['sync-template-steps']) {
    throw new Error(`The target project is missing the template-step sync scripts required for installation.`)
  }

  if (!existsSync(path.join(root, 'scripts', 'install-template-step.ts'))) {
    throw new Error(`The target project is missing scripts/install-template-step.ts.`)
  }

  if (!existsSync(path.join(root, 'node_modules'))) {
    throw new Error(`Dependencies are not installed in ${root}. Run your package manager install first.`)
  }

  return {
    root,
    packageManager: detectPackageManager(root),
    packageJsonPath,
  }
}

export function detectPackageManager(projectRoot: string): PackageManager {
  if (existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(projectRoot, 'bun.lockb'))) return 'bun'
  return 'npm'
}
