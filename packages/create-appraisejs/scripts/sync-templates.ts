#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const source = join(repoRoot, 'templates', 'default');
const dest = join(__dirname, '..', 'templates', 'default');

const EXCLUDED_TEST_DATA_PREFIXES = [
  'automation/features/',
  'automation/config/environments/',
  'automation/locators/',
  'automation/reports/',
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

// Clear and recreate automation workspace directories so dest has no leftover project data
const dirsToClear = [
  join(dest, 'automation', 'features'),
  join(dest, 'automation', 'locators'),
  join(dest, 'automation', 'reports'),
];
for (const dir of dirsToClear) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
}
const automationDirs = [
  join(dest, 'automation', 'features'),
  join(dest, 'automation', 'config', 'environments'),
  join(dest, 'automation', 'locators'),
  join(dest, 'automation', 'reports'),
  join(dest, 'automation', 'mapping'),
];
for (const dir of automationDirs) {
  mkdirSync(dir, { recursive: true });
}
writeFileSync(join(dest, 'automation', 'config', 'environments', 'environments.json'), JSON.stringify({}) + '\n');
writeFileSync(join(dest, 'automation', 'mapping', 'locator-map.json'), JSON.stringify([]) + '\n');

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

