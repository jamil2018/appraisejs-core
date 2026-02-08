import { spawn } from 'child_process';
import path from 'path';
import type { PackageManager } from './prompts.js';

export function getInstallCommand(pm: PackageManager): { command: string; args: string[] } {
  switch (pm) {
    case 'npm':
      return { command: 'npm', args: ['install', '--legacy-peer-deps'] };
    case 'pnpm':
      return { command: 'pnpm', args: ['install'] };
    case 'yarn':
      return { command: 'yarn', args: ['install'] };
    case 'bun':
      return { command: 'bun', args: ['install'] };
    default:
      return { command: 'npm', args: ['install', '--legacy-peer-deps'] };
  }
}

export function runInstall(targetDir: string, pm: PackageManager): Promise<void> {
  const { command, args } = getInstallCommand(pm);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(targetDir),
      stdio: 'inherit',
      shell: true,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
