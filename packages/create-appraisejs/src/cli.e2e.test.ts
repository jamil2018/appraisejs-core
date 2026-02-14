import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { getTemplatePath } from './copy-template.js';
import { patchPackageJsonScripts } from './install.js';

describe('CLI E2E', () => {
  let tempDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-e2e-'));
    destDir = path.join(tempDir, 'my-app');
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  it('scaffolds app when run with non-interactive input (manual run required for full E2E)', async () => {
    const templatePath = getTemplatePath();
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)');
      return;
    }

    await fs.ensureDir(destDir);
    const pkgJsonPath = path.join(destDir, 'package.json');
    const srcPath = path.join(destDir, 'src');

    const { copyTemplate } = await import('./copy-template.js');
    await copyTemplate(destDir);

    expect(await fs.pathExists(pkgJsonPath)).toBe(true);
    expect(await fs.pathExists(srcPath)).toBe(true);
    const pkg = await fs.readJson(pkgJsonPath);
    expect(pkg.name).toBe('appraisejs');
    expect(pkg.scripts?.dev).toBeDefined();
  });

  it('patchPackageJsonScripts rewrites real template scripts for chosen package manager', async () => {
    const templatePath = getTemplatePath();
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)');
      return;
    }

    const { copyTemplate } = await import('./copy-template.js');
    await copyTemplate(destDir);

    const pkgBefore = await fs.readJson(path.join(destDir, 'package.json'));
    expect(pkgBefore.scripts['install-dependencies']).toBe('npm install --legacy-peer-deps');
    expect(pkgBefore.scripts.setup).toMatch(/npm run /);

    await patchPackageJsonScripts(destDir, 'pnpm');

    const pkgAfter = await fs.readJson(path.join(destDir, 'package.json'));
    expect(pkgAfter.scripts['install-dependencies']).toBe('pnpm install');
    expect(pkgAfter.scripts.setup).toBe(
      'pnpm run install-dependencies && pnpm run setup-env && pnpm run migrate-db && pnpm run install-playwright'
    );
    expect(pkgAfter.scripts['appraisejs:setup']).toBe('pnpm run setup');
    expect(pkgAfter.scripts['appraisejs:sync']).toBe('pnpm run sync-all');
    expect(pkgAfter.scripts['setup-env']).toContain('pnpm exec ');
    expect(pkgAfter.scripts['setup-env']).not.toContain('npx ');
    expect(pkgAfter.scripts['sync-all']).toContain('pnpm exec ');
    expect(pkgAfter.scripts['install-playwright']).toContain('pnpm exec ');
    expect(pkgAfter.scripts['install-playwright']).not.toContain('npx ');
  });

  it('patchPackageJsonScripts rewrites npx-using scripts for bun', async () => {
    const templatePath = getTemplatePath();
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)');
      return;
    }

    const { copyTemplate } = await import('./copy-template.js');
    await copyTemplate(destDir);

    await patchPackageJsonScripts(destDir, 'bun');

    const pkgAfter = await fs.readJson(path.join(destDir, 'package.json'));
    expect(pkgAfter.scripts['setup-env']).toContain('bunx ');
    expect(pkgAfter.scripts['sync-all']).toContain('bunx ');
    expect(pkgAfter.scripts['install-playwright']).toContain('bunx ');
    expect(pkgAfter.scripts['setup-env']).not.toContain('npx ');
  });
});
