import type { PackageManager } from './prompts.js'

interface PackageManagerProfile {
  command: PackageManager
  installDependenciesScript: string
  runPrefix: string
  execPrefix: string
}

const PACKAGE_MANAGER_PROFILES: Record<PackageManager, PackageManagerProfile> = {
  npm: {
    command: 'npm',
    installDependenciesScript: 'npm install --legacy-peer-deps',
    runPrefix: 'npm run',
    execPrefix: 'npx ',
  },
  pnpm: {
    command: 'pnpm',
    installDependenciesScript: 'pnpm install',
    runPrefix: 'pnpm run',
    execPrefix: 'pnpm exec ',
  },
  yarn: {
    command: 'yarn',
    installDependenciesScript: 'yarn install',
    runPrefix: 'yarn run',
    execPrefix: 'yarn run ',
  },
  bun: {
    command: 'bun',
    installDependenciesScript: 'bun install',
    runPrefix: 'bun run',
    execPrefix: 'bunx ',
  },
}

export function getPackageManagerProfile(packageManager: PackageManager): PackageManagerProfile {
  return PACKAGE_MANAGER_PROFILES[packageManager]
}

export function rewriteScriptsForPackageManager(
  scripts: Record<string, string>,
  packageManager: PackageManager,
): Record<string, string> {
  const profile = getPackageManagerProfile(packageManager)
  const rewrittenScripts = Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [
      key,
      value.replace(/npm run /g, `${profile.runPrefix} `).replace(/npx /g, profile.execPrefix),
    ]),
  )

  if (rewrittenScripts['install-dependencies'] !== undefined) {
    rewrittenScripts['install-dependencies'] = profile.installDependenciesScript
  }
  if (rewrittenScripts['appraisejs:setup'] !== undefined) {
    rewrittenScripts['appraisejs:setup'] = `${profile.runPrefix} setup`
  }
  return rewrittenScripts
}
