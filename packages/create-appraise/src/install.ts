import fs from 'fs-extra';
import spawn from 'cross-spawn';
import path from 'path';
import type { PackageManager } from './prompts.js';

const RUN_SETUP_ARGS = ['run', 'setup'] as const;

/** Used for "next steps" when user skips running setup (setup includes install). */
export function getInstallCommand(pm: PackageManager): { command: string; args: string[] } {
  switch (pm) {
    case 'npm':
      return { command: 'npm', args: [...RUN_SETUP_ARGS] };
    case 'pnpm':
      return { command: 'pnpm', args: [...RUN_SETUP_ARGS] };
    case 'yarn':
      return { command: 'yarn', args: [...RUN_SETUP_ARGS] };
    case 'bun':
      return { command: 'bun', args: [...RUN_SETUP_ARGS] };
    default:
      return { command: 'npm', args: [...RUN_SETUP_ARGS] };
  }
}

/** Install command for each PM (used in package.json install-dependencies script). */
function getInstallScript(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npm install --legacy-peer-deps';
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install --legacy-peer-deps';
  }
}

/** "pm run" prefix for script invocations (e.g. "pnpm run"). */
function getRunPrefix(pm: PackageManager): string {
  return `${pm} run`;
}

/** Exec prefix for running binaries (replaces "npx " in script bodies). */
function getExecPrefix(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npx ';
    case 'pnpm':
      return 'pnpm exec ';
    case 'yarn':
      return 'yarn run ';
    case 'bun':
      return 'bunx ';
    default:
      return 'npx ';
  }
}

/**
 * Rewrite the project's package.json scripts to use the user's package manager
 * instead of hardcoded npm, so that `setup` and related scripts use the chosen PM.
 */
export async function patchPackageJsonScripts(targetDir: string, pm: PackageManager): Promise<void> {
  const pkgPath = path.join(path.resolve(targetDir), 'package.json');
  if (!(await fs.pathExists(pkgPath))) return;

  const pkg = (await fs.readJson(pkgPath)) as { scripts?: Record<string, string> };
  if (!pkg.scripts) return;

  const installScript = getInstallScript(pm);
  const runPrefix = getRunPrefix(pm);

  if (pkg.scripts['install-dependencies'] !== undefined) {
    pkg.scripts['install-dependencies'] = installScript;
  }
  if (pkg.scripts['setup'] !== undefined) {
    pkg.scripts['setup'] = pkg.scripts['setup'].replace(/npm run /g, `${runPrefix} `);
  }
  if (pkg.scripts['appraise:setup'] !== undefined) {
    pkg.scripts['appraise:setup'] = `${runPrefix} setup`;
  }
  if (pkg.scripts['appraise:sync'] !== undefined) {
    pkg.scripts['appraise:sync'] = `${runPrefix} sync-all`;
  }

  const execPrefix = getExecPrefix(pm);
  for (const key of Object.keys(pkg.scripts)) {
    const value = pkg.scripts[key];
    if (typeof value === 'string' && value.includes('npx ')) {
      pkg.scripts[key] = value.replace(/npx /g, execPrefix);
    }
  }

  await fs.writeJson(pkgPath, pkg, { spaces: 2 });
}

function spawnOptions(targetDir: string) {
  return {
    cwd: path.resolve(targetDir),
    stdio: ['ignore', 'inherit', 'inherit'] as ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      ADBLOCK: '1',
      NODE_ENV: 'development',
      DISABLE_OPENCOLLECTIVE: '1',
    },
  };
}

/**
 * Run the project's `setup` script (install-dependencies, setup-env, migrate-db, install-playwright).
 * The template's setup already runs install, so we only need to run this once.
 */
export function runSetup(targetDir: string, pm: PackageManager): Promise<void> {
  const { command, args } = getInstallCommand(pm);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, spawnOptions(targetDir));
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
