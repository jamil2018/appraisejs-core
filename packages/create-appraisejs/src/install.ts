import fs from 'fs-extra';
import spawn from 'cross-spawn';
import path from 'path';
import { getPackageManagerProfile, rewriteScriptsForPackageManager } from './package-manager.js';
import type { PackageManager, PlaywrightBrowser } from './prompts.js';

const RUN_SETUP_ARGS = ['run', 'setup'] as const;
const RUN_PLAYWRIGHT_INSTALL_ARGS = ['run', 'install-playwright', '--'] as const;

/** Used for "next steps" when user skips running setup (setup includes install). */
export function getInstallCommand(pm: PackageManager): { command: string; args: string[] } {
  return { command: getPackageManagerProfile(pm).command, args: [...RUN_SETUP_ARGS] };
}

export function getPlaywrightInstallCommand(
  pm: PackageManager,
  browsers: PlaywrightBrowser[],
): { command: string; args: string[] } {
  return {
    command: pm,
    args: [...RUN_PLAYWRIGHT_INSTALL_ARGS, ...browsers],
  };
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

  pkg.scripts = rewriteScriptsForPackageManager(pkg.scripts, pm);

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

function runCommand(targetDir: string, command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, spawnOptions(targetDir));
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/**
 * Run the project's `setup` script (install-dependencies, setup-env, build:local)
 * and optionally install the selected Playwright browsers afterward.
 */
export async function runSetup(
  targetDir: string,
  pm: PackageManager,
  browsers: PlaywrightBrowser[],
): Promise<void> {
  const { command, args } = getInstallCommand(pm);
  await runCommand(targetDir, command, args);

  if (browsers.length > 0) {
    const playwrightCommand = getPlaywrightInstallCommand(pm, browsers);
    await runCommand(targetDir, playwrightCommand.command, playwrightCommand.args);
  }
}
