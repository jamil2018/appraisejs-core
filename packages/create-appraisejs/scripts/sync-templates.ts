#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const source = join(repoRoot, 'templates', 'default');
const dest = join(__dirname, '..', 'templates', 'default');

const EXCLUDED_TEST_DATA_PREFIXES = [
  'src/tests/features/',
  'src/tests/config/environments/',
  'src/tests/locators/',
  'src/tests/reports/',
];

function shouldExcludeFromCopy(sourcePath: string): boolean {
  const rel = sourcePath.slice(source.length).replace(/^[/\\]/, '') || '';
  return EXCLUDED_TEST_DATA_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

if (!existsSync(source)) {
  console.error('Source template not found:', source);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(source, dest, {
  recursive: true,
  force: true,
  filter: (sourcePath: string) => !shouldExcludeFromCopy(sourcePath),
});

// Clear and recreate test data directories so dest has no leftover project data
const dirsToClear = [
  join(dest, 'src', 'tests', 'features'),
  join(dest, 'src', 'tests', 'locators'),
  join(dest, 'src', 'tests', 'reports'),
];
for (const dir of dirsToClear) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
}
const testDirs = [
  join(dest, 'src', 'tests', 'features'),
  join(dest, 'src', 'tests', 'config', 'environments'),
  join(dest, 'src', 'tests', 'locators'),
  join(dest, 'src', 'tests', 'reports'),
  join(dest, 'src', 'tests', 'mapping'),
];
for (const dir of testDirs) {
  mkdirSync(dir, { recursive: true });
}
writeFileSync(join(dest, 'src', 'tests', 'config', 'environments', 'environments.json'), JSON.stringify({}) + '\n');
writeFileSync(join(dest, 'src', 'tests', 'mapping', 'locator-map.json'), JSON.stringify([]) + '\n');

// Copy cucumber.mjs from repo root (required for running tests)
const cucumberSource = join(repoRoot, 'cucumber.mjs');
if (existsSync(cucumberSource)) {
  cpSync(cucumberSource, join(dest, 'cucumber.mjs'), { force: true });
  console.log('Synced cucumber.mjs to template');
}

// Copy .vscode folder from repo root
const vscodeSource = join(repoRoot, '.vscode');
if (existsSync(vscodeSource)) {
  cpSync(vscodeSource, join(dest, '.vscode'), { recursive: true, force: true });
  console.log('Synced .vscode to template');
}

console.log('Synced templates/default to packages/create-appraisejs/templates/default');
