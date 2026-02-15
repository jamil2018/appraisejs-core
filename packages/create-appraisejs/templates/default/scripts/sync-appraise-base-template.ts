#!/usr/bin/env node
/**
 * Sync the default template from the base app (repo root).
 * Copies src/, prisma/, public/, scripts/, and root config files into templates/default/,
 * preserves template-only README.md and appraisejs.config.json, and merges package.json scripts.
 *
 * Usage: npx tsx scripts/sync-appraise-base-template.ts
 * Or: npm run sync-template
 */

import { cpSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const target = join(repoRoot, 'templates', 'default');

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git']);
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);

function shouldExclude(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/);
  if (parts.some((p) => EXCLUDED_DIRS.has(p))) return true;
  const ext = relativePath.endsWith('.sqlite3')
    ? '.sqlite3'
    : relativePath.endsWith('.sqlite')
      ? '.sqlite'
      : relativePath.slice(relativePath.lastIndexOf('.'));
  if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  return false;
}

function copyDirWithFilter(src: string, dest: string): void {
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (source: string) => {
      const rel = source.slice(src.length).replace(/^[/\\]/, '') || '';
      return !shouldExclude(rel);
    },
  });
}

function copyFile(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { force: true });
}

// 1. Preserve template-only files
const readmePath = join(target, 'README.md');
const appraisejsConfigPath = join(target, 'appraisejs.config.json');
const savedReadme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null;
const savedAppraisejsConfig = existsSync(appraisejsConfigPath)
  ? readFileSync(appraisejsConfigPath, 'utf8')
  : null;

// 2. Copy directories
console.log('Copying src/...');
copyDirWithFilter(join(repoRoot, 'src'), join(target, 'src'));
console.log('Copying prisma/...');
copyDirWithFilter(join(repoRoot, 'prisma'), join(target, 'prisma'));
console.log('Copying public/...');
copyDirWithFilter(join(repoRoot, 'public'), join(target, 'public'));
console.log('Copying scripts/...');
copyDirWithFilter(join(repoRoot, 'scripts'), join(target, 'scripts'));

// 3. Copy root config files and package lock files
const configFiles = [
  'eslint.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'components.json',
  'next.config.ts',
  '.env.example',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];
console.log('Copying config files...');
for (const name of configFiles) {
  const src = join(repoRoot, name);
  if (existsSync(src)) {
    copyFile(src, join(target, name));
  }
}

// 4. package.json: base + template-only scripts
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  [key: string]: unknown;
};
rootPkg.scripts['appraisejs:setup'] = 'npm run setup';
rootPkg.scripts['appraisejs:sync'] = 'npm run sync-all';
writeFileSync(join(target, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n');
console.log('Wrote package.json with appraisejs:setup and appraisejs:sync.');

// 5. Restore template-only files
if (savedReadme) {
  writeFileSync(readmePath, savedReadme);
  console.log('Restored README.md');
}
if (savedAppraisejsConfig) {
  writeFileSync(appraisejsConfigPath, savedAppraisejsConfig);
  console.log('Restored appraisejs.config.json');
}

console.log('Synced base app to templates/default.');
