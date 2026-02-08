#!/usr/bin/env node
import path from 'path';
import { runPrompts } from './prompts.js';
import { copyTemplate } from './copy-template.js';
import { runInstall, getInstallCommand } from './install.js';

function printSuccessMessage(targetDir: string, packageManager: string, didInstall: boolean): void {
  const relativePath = path.relative(process.cwd(), targetDir);
  const cdPath = relativePath.startsWith('..') ? targetDir : `./${relativePath}`;

  console.log('\n\u2713 Appraise app created successfully!\n');
  console.log(`  Location: ${targetDir}\n`);
  console.log('  Next steps:\n');
  if (!didInstall) {
    const { command, args } = getInstallCommand(packageManager as 'npm' | 'pnpm' | 'yarn' | 'bun');
    console.log(`  1. cd ${cdPath}`);
    console.log(`  2. ${command} ${args.join(' ')}`);
    console.log('  3. npm run setup');
    console.log('  4. npm run dev\n');
  } else {
    console.log(`  1. cd ${cdPath}`);
    console.log('  2. npm run setup');
    console.log('  3. npm run dev\n');
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

  try {
    console.log('\n  Validating target directory...');
    console.log(`  Creating project at: ${directory}\n`);

    console.log('  Copying template files...');
    await copyTemplate(directory);
    console.log('  Template files copied.\n');

    if (shouldRunInstall) {
      console.log('  Installing dependencies...');
      await runInstall(directory, packageManager);
      console.log('  Dependencies installed.\n');
    }

    printSuccessMessage(directory, packageManager, shouldRunInstall);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n\u2717', message);
    process.exit(1);
  }
}

main();
