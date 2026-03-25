import { checkbox, confirm, input, select } from '@inquirer/prompts';
import path from 'path';
import fs from 'fs';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type PlaywrightBrowser = 'chromium' | 'firefox' | 'webkit';

export interface PromptAnswers {
  directory: string;
  packageManager: PackageManager;
  runInstall: boolean;
  playwrightBrowsers: PlaywrightBrowser[];
}

const DEFAULT_DIR = './my-appraisejs-app';

function isDirEmpty(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return true;
  const entries = fs.readdirSync(dirPath);
  return entries.length === 0;
}

function validateTargetDirectory(resolved: string): void {
  if (!fs.existsSync(resolved)) return;
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path exists and is not a directory: ${resolved}`);
  }
  if (!isDirEmpty(resolved)) {
    throw new Error(
      `Directory must be empty: ${resolved}\nPlease choose an empty directory or a new path.`
    );
  }
}

export async function runPrompts(cwd: string): Promise<PromptAnswers> {
  const rawDir = await input({
    message: 'Where should we create your app?',
    default: DEFAULT_DIR,
    validate: (value) => {
      if (!value?.trim()) return 'Please enter a directory path.';
      return true;
    },
  });

  const directory = rawDir.trim() || DEFAULT_DIR;
  const resolved = path.resolve(cwd, directory);

  try {
    validateTargetDirectory(resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }

  const packageManager = await select<PackageManager>({
    message: 'Which package manager do you want to use?',
    choices: [
      { name: 'npm', value: 'npm' },
      { name: 'pnpm', value: 'pnpm' },
      { name: 'yarn', value: 'yarn' },
      { name: 'bun', value: 'bun' },
    ],
    default: 'npm',
  });

  const runInstall = await confirm({
    message: 'Would you like to run the production setup now?',
    default: true,
  });

  const playwrightBrowsers = await checkbox<PlaywrightBrowser>({
    message: 'Which Playwright browsers should we install?',
    choices: [
      { name: 'Chromium', value: 'chromium' },
      { name: 'Firefox', value: 'firefox' },
      { name: 'WebKit', value: 'webkit' },
    ],
  });

  return { directory: resolved, packageManager, runInstall, playwrightBrowsers };
}
