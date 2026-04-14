#!/usr/bin/env node
import path from 'path'
import { runPrompts, type PlaywrightBrowser } from './prompts.js'
import { createProject } from './create-project.js'
import { getInstallCommand } from './install.js'
import { parseCliArgs } from './cli-args.js'
import type { TemplateId } from './template-catalog.js'

function formatBrowserInstallStep(packageManager: string, browsers: PlaywrightBrowser[]): string | null {
  if (browsers.length === 0) {
    return null
  }

  return `${packageManager} run install-playwright -- ${browsers.join(' ')}`
}

export function getSuccessMessageLines(
  targetDir: string,
  template: TemplateId,
  packageManager: string,
  didInstall: boolean,
  playwrightBrowsers: PlaywrightBrowser[],
): string[] {
  const relativePath = path.relative(process.cwd(), targetDir)
  const cdPath = relativePath.startsWith('..') ? targetDir : `./${relativePath}`
  const browserInstallStep = formatBrowserInstallStep(packageManager, playwrightBrowsers)
  const lines = [
    '\n\u2713 Appraise app created successfully!\n',
    `  Location: ${targetDir}\n`,
    `  Template: ${template}\n`,
    '  Next steps:\n',
  ]

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
  template: TemplateId,
  packageManager: string,
  didInstall: boolean,
  playwrightBrowsers: PlaywrightBrowser[],
): void {
  for (const line of getSuccessMessageLines(targetDir, template, packageManager, didInstall, playwrightBrowsers)) {
    console.log(line)
  }
}

async function main(): Promise<void> {
  console.log('\n  Create Appraise\n')
  const cwd = process.cwd()

  let cliOptions
  let answers
  try {
    cliOptions = parseCliArgs(process.argv.slice(2))
    answers = await runPrompts(cwd, cliOptions)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('\n\u2717', message)
    process.exit(1)
  }

  const { directory, template, packageManager, runInstall: shouldRunInstall, playwrightBrowsers } = answers

  try {
    await createProject({ directory, template, packageManager, runInstall: shouldRunInstall, playwrightBrowsers })
    printSuccessMessage(directory, template, packageManager, shouldRunInstall, playwrightBrowsers)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('\n\u2717', message)
    process.exit(1)
  }
}

main()
