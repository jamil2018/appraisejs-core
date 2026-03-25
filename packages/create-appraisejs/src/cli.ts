#!/usr/bin/env node
import path from 'path'
import { runPrompts, type PlaywrightBrowser } from './prompts.js'
import { createProject } from './create-project.js'
import { getInstallCommand } from './install.js'

function formatBrowserInstallStep(packageManager: string, browsers: PlaywrightBrowser[]): string | null {
  if (browsers.length === 0) {
    return null
  }

  return `${packageManager} run install-playwright -- ${browsers.join(' ')}`
}

export function getSuccessMessageLines(
  targetDir: string,
  packageManager: string,
  didInstall: boolean,
  playwrightBrowsers: PlaywrightBrowser[],
): string[] {
  const relativePath = path.relative(process.cwd(), targetDir)
  const cdPath = relativePath.startsWith('..') ? targetDir : `./${relativePath}`
  const browserInstallStep = formatBrowserInstallStep(packageManager, playwrightBrowsers)
  const lines = ['\n\u2713 Appraise app created successfully!\n', `  Location: ${targetDir}\n`, '  Next steps:\n']

  const pm = packageManager as 'npm' | 'pnpm' | 'yarn' | 'bun'
  if (!didInstall) {
    const { command, args } = getInstallCommand(pm)
    lines.push(`  1. cd ${cdPath}`)
    lines.push(`  2. ${command} ${args.join(' ')}`)
    if (browserInstallStep) {
      lines.push(`  3. ${browserInstallStep}`)
      lines.push(`  4. ${pm} run start\n`)
    } else {
      lines.push(`  3. ${pm} run start\n`)
    }
  } else {
    lines.push(`  1. cd ${cdPath}`)
    lines.push(`  2. ${pm} run start\n`)
  }
  lines.push('  See README.md in the project for more details.\n')
  return lines
}

function printSuccessMessage(
  targetDir: string,
  packageManager: string,
  didInstall: boolean,
  playwrightBrowsers: PlaywrightBrowser[],
): void {
  for (const line of getSuccessMessageLines(targetDir, packageManager, didInstall, playwrightBrowsers)) {
    console.log(line)
  }
}

async function main(): Promise<void> {
  console.log('\n  Create Appraise\n')
  const cwd = process.cwd()

  let answers
  try {
    answers = await runPrompts(cwd)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('\n\u2717', message)
    process.exit(1)
  }

  const { directory, packageManager, runInstall: shouldRunInstall, playwrightBrowsers } = answers

  try {
    await createProject({ directory, packageManager, runInstall: shouldRunInstall, playwrightBrowsers })
    printSuccessMessage(directory, packageManager, shouldRunInstall, playwrightBrowsers)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('\n\u2717', message)
    process.exit(1)
  }
}

main()
