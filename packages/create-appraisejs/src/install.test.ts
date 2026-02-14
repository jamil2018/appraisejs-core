import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { describe, it, expect } from 'vitest';
import { getInstallCommand, patchPackageJsonScripts } from './install.js';

const TEMPLATE_SCRIPTS = {
  'install-dependencies': 'npm install --legacy-peer-deps',
  setup:
    'npm run install-dependencies && npm run setup-env && npm run migrate-db && npm run install-playwright',
  'appraisejs:setup': 'npm run setup',
  'appraisejs:sync': 'npm run sync-all',
  'setup-env': 'npx tsx scripts/setup-env.ts',
  'migrate-db': 'npx prisma migrate dev',
  'install-playwright': 'npx playwright install && npx playwright install-deps',
  'sync-all': 'npx tsx scripts/sync-all.ts',
};

async function patchAndRead(dir: string, pm: 'npm' | 'pnpm' | 'yarn' | 'bun') {
  await fs.writeJson(path.join(dir, 'package.json'), { name: 'appraisejs', scripts: { ...TEMPLATE_SCRIPTS } });
  await patchPackageJsonScripts(dir, pm);
  return fs.readJson(path.join(dir, 'package.json'));
}

describe('patchPackageJsonScripts', () => {
  it('rewrites package.json scripts to use pnpm instead of npm', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-'));
    try {
      const pkg = await patchAndRead(dir, 'pnpm');
      expect(pkg.scripts['install-dependencies']).toBe('pnpm install');
      expect(pkg.scripts.setup).toBe(
        'pnpm run install-dependencies && pnpm run setup-env && pnpm run migrate-db && pnpm run install-playwright'
      );
      expect(pkg.scripts['appraisejs:setup']).toBe('pnpm run setup');
      expect(pkg.scripts['appraisejs:sync']).toBe('pnpm run sync-all');
      expect(pkg.scripts['setup-env']).toBe('pnpm exec tsx scripts/setup-env.ts');
      expect(pkg.scripts['migrate-db']).toBe('pnpm exec prisma migrate dev');
      expect(pkg.scripts['install-playwright']).toBe(
        'pnpm exec playwright install && pnpm exec playwright install-deps'
      );
      expect(pkg.scripts['sync-all']).toBe('pnpm exec tsx scripts/sync-all.ts');
      expect(pkg.scripts['setup-env']).not.toContain('npx ');
    } finally {
      await fs.remove(dir).catch(() => {});
    }
  });

  it('rewrites scripts for npm (keeps legacy-peer-deps and npx)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-npm-'));
    try {
      const pkg = await patchAndRead(dir, 'npm');
      expect(pkg.scripts['install-dependencies']).toBe('npm install --legacy-peer-deps');
      expect(pkg.scripts.setup).toContain('npm run install-dependencies');
      expect(pkg.scripts.setup).not.toContain('pnpm run');
      expect(pkg.scripts['setup-env']).toContain('npx ');
      expect(pkg.scripts['setup-env']).toBe('npx tsx scripts/setup-env.ts');
      expect(pkg.scripts['sync-all']).toBe('npx tsx scripts/sync-all.ts');
    } finally {
      await fs.remove(dir).catch(() => {});
    }
  });

  it('rewrites scripts for yarn', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-yarn-'));
    try {
      const pkg = await patchAndRead(dir, 'yarn');
      expect(pkg.scripts['install-dependencies']).toBe('yarn install');
      expect(pkg.scripts.setup).toBe(
        'yarn run install-dependencies && yarn run setup-env && yarn run migrate-db && yarn run install-playwright'
      );
      expect(pkg.scripts['appraisejs:setup']).toBe('yarn run setup');
      expect(pkg.scripts['setup-env']).toBe('yarn run tsx scripts/setup-env.ts');
      expect(pkg.scripts['install-playwright']).toBe(
        'yarn run playwright install && yarn run playwright install-deps'
      );
      expect(pkg.scripts['sync-all']).not.toContain('npx ');
    } finally {
      await fs.remove(dir).catch(() => {});
    }
  });

  it('rewrites scripts for bun', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-bun-'));
    try {
      const pkg = await patchAndRead(dir, 'bun');
      expect(pkg.scripts['install-dependencies']).toBe('bun install');
      expect(pkg.scripts.setup).toContain('bun run install-dependencies');
      expect(pkg.scripts['appraisejs:sync']).toBe('bun run sync-all');
      expect(pkg.scripts['setup-env']).toBe('bunx tsx scripts/setup-env.ts');
      expect(pkg.scripts['migrate-db']).toBe('bunx prisma migrate dev');
      expect(pkg.scripts['sync-all']).toContain('bunx ');
      expect(pkg.scripts['sync-all']).not.toContain('npx ');
    } finally {
      await fs.remove(dir).catch(() => {});
    }
  });

  it('no-ops when package.json does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-noop-'));
    try {
      await patchPackageJsonScripts(dir, 'yarn');
      await expect(fs.pathExists(path.join(dir, 'package.json'))).resolves.toBe(false);
    } finally {
      await fs.remove(dir).catch(() => {});
    }
  });
});

describe('getInstallCommand', () => {
  it('returns npm run setup for npm', () => {
    const result = getInstallCommand('npm');
    expect(result).toEqual({ command: 'npm', args: ['run', 'setup'] });
    expect(`${result.command} ${result.args.join(' ')}`).toBe('npm run setup');
  });

  it('returns pnpm run setup for pnpm', () => {
    const result = getInstallCommand('pnpm');
    expect(result).toEqual({ command: 'pnpm', args: ['run', 'setup'] });
    expect(`${result.command} ${result.args.join(' ')}`).toBe('pnpm run setup');
  });

  it('returns yarn run setup for yarn', () => {
    const result = getInstallCommand('yarn');
    expect(result).toEqual({ command: 'yarn', args: ['run', 'setup'] });
    expect(`${result.command} ${result.args.join(' ')}`).toBe('yarn run setup');
  });

  it('returns bun run setup for bun', () => {
    const result = getInstallCommand('bun');
    expect(result).toEqual({ command: 'bun', args: ['run', 'setup'] });
    expect(`${result.command} ${result.args.join(' ')}`).toBe('bun run setup');
  });
});
