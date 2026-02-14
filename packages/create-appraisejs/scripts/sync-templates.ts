#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const source = join(repoRoot, 'templates', 'default');
const dest = join(__dirname, '..', 'templates', 'default');

if (!existsSync(source)) {
  console.error('Source template not found:', source);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true, force: true });
console.log('Synced templates/default to packages/create-appraisejs/templates/default');
