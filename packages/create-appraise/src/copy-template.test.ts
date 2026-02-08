import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { copyTemplate, getTemplatePath } from './copy-template.js';

describe('copy-template', () => {
  let tempDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraise-test-'));
    destDir = path.join(tempDir, 'output');
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('getTemplatePath', () => {
    it('returns a path ending with templates/default', () => {
      const templatePath = getTemplatePath();
      expect(templatePath).toMatch(/[\\/]templates[\\/]default$/);
    });
  });

  describe('copyTemplate', () => {
    it('copies template files and excludes node_modules, .env, and lockfiles', async () => {
      const fixtureDir = path.join(tempDir, 'fixture');
      await fs.ensureDir(path.join(fixtureDir, 'src', 'app'));
      await fs.ensureDir(path.join(fixtureDir, 'node_modules', 'pkg'));
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' });
      await fs.writeFile(path.join(fixtureDir, '.env'), 'SECRET=1');
      await fs.writeFile(path.join(fixtureDir, 'package-lock.json'), '{}');
      await fs.writeFile(path.join(fixtureDir, 'src', 'app', 'page.tsx'), 'export default function Page() {}');

      const { getCollectedFilesForTest } = await import('./copy-template.js');
      const files = getCollectedFilesForTest(fixtureDir);
      expect(files).toContain('package.json');
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      expect(files.some((f) => f.includes('.env'))).toBe(false);
      expect(files.some((f) => f.includes('package-lock'))).toBe(false);
      const srcFiles = files.filter((f) => f.includes('src'));
      expect(srcFiles.length).toBeGreaterThan(0);

      await copyTemplate(destDir, undefined, fixtureDir);

      expect(await fs.pathExists(path.join(destDir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'src'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'src', 'app', 'page.tsx'))).toBe(true);

      const hasNodeModules = await fs.pathExists(path.join(destDir, 'node_modules'));
      const hasEnv = await fs.pathExists(path.join(destDir, '.env'));
      const hasLock = await fs.pathExists(path.join(destDir, 'package-lock.json'));

      expect(hasNodeModules).toBe(false);
      expect(hasEnv).toBe(false);
      expect(hasLock).toBe(false);
    });
  });
});
