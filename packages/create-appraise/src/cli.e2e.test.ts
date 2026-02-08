import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { spawn } from 'child_process';
import { getTemplatePath } from './copy-template.js';

describe('CLI E2E', () => {
  let tempDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraise-e2e-'));
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
    expect(pkg.name).toBe('appraise');
    expect(pkg.scripts?.dev).toBeDefined();
  });
});
