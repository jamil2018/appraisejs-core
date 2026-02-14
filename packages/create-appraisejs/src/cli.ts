#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
import { runPrompts } from './prompts.js';
import { copyTemplate } from './copy-template.js';
import { runSetup, getInstallCommand, patchPackageJsonScripts } from './install.js';
import { getConfig } from './config.js';
import { downloadRepo } from './download-repo.js';

function printSuccessMessage(targetDir: string, packageManager: string, didInstall: boolean): void {
  const relativePath = path.relative(process.cwd(), targetDir);
  const cdPath = relativePath.startsWith('..') ? targetDir : `./${relativePath}`;

  console.log('\n\u2713 Appraise app created successfully!\n');
  console.log(`  Location: ${targetDir}\n`);
  console.log('  Next steps:\n');
  const pm = packageManager as 'npm' | 'pnpm' | 'yarn' | 'bun';
  if (!didInstall) {
    const { command, args } = getInstallCommand(pm);
    console.log(`  1. cd ${cdPath}`);
    console.log(`  2. ${command} ${args.join(' ')}`);
    console.log(`  3. ${pm} run dev\n`);
  } else {
    console.log(`  1. cd ${cdPath}`);
    console.log(`  2. ${pm} run dev\n`);
  }
  console.log('  See README.md in the project for more details.\n');
}

async function main(): Promise<void> {
  console.log('\n  Create Appraise\n');
  const cwd = process.cwd();

  let answers;
  try {
    answers = await runPrompts(cwd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n\u2717', message);
    process.exit(1);
  }

  const { directory, packageManager, runInstall: shouldRunInstall } = answers;
  const config = getConfig();

  try {
    console.log('\n  Validating target directory...');
    console.log(`  Creating project at: ${directory}\n`);

    if (config.useBundled) {
      console.log('  Copying template files...');
      await copyTemplate(directory);
      console.log('  Template files copied.\n');
    } else {
      let cleanupDir: string | null = null;
      try {
        console.log('  Downloading template from', config.repoBase, '...');
        const { repoRoot, cleanupDir: dir } = await downloadRepo(
          config.repoBase,
          config.branch,
          config.templateSubpath
        );
        cleanupDir = dir;
        const templatePathOverride = path.join(repoRoot, config.templateSubpath);
        console.log('  Copying template files...');
        await copyTemplate(directory, undefined, templatePathOverride);
        console.log('  Template files copied.\n');
      } finally {
        if (cleanupDir) {
          await fs.remove(cleanupDir).catch(() => {});
        }
      }
    }

    await patchPackageJsonScripts(directory, packageManager);

    if (shouldRunInstall) {
      console.log('  Running setup (dependencies, env, db, Playwright)...');
      await runSetup(directory, packageManager);
      console.log('  Setup complete.\n');
    }

    printSuccessMessage(directory, packageManager, shouldRunInstall);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n\u2717', message);
    process.exit(1);
  }
}

main();
