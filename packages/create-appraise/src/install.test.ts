import { describe, it, expect } from 'vitest';
import { getInstallCommand } from './install.js';

describe('getInstallCommand', () => {
  it('returns npm install with legacy-peer-deps for npm', () => {
    const result = getInstallCommand('npm');
    expect(result).toEqual({ command: 'npm', args: ['install', '--legacy-peer-deps'] });
  });

  it('returns pnpm install for pnpm', () => {
    const result = getInstallCommand('pnpm');
    expect(result).toEqual({ command: 'pnpm', args: ['install'] });
  });

  it('returns yarn install for yarn', () => {
    const result = getInstallCommand('yarn');
    expect(result).toEqual({ command: 'yarn', args: ['install'] });
  });

  it('returns bun install for bun', () => {
    const result = getInstallCommand('bun');
    expect(result).toEqual({ command: 'bun', args: ['install'] });
  });
});
