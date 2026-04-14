#!/usr/bin/env tsx

import fs from 'fs'
import path from 'path'

const SEEDED_TEMPLATE_PATHS = ['prisma/dev.db', 'automation/config/environments/environments.json']

/**
 * Trims trailing blank lines while preserving internal spacing.
 */
function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop()
  }
  return trimmed
}

/**
 * Rewrites `.gitignore` content to enforce seeded-template tracking rules.
 */
function setSeededTemplateFilesTracked(content: string, tracked: boolean): string {
  const managedLines = new Set(SEEDED_TEMPLATE_PATHS.flatMap(filePath => [filePath, `!${filePath}`]))
  const lines = trimTrailingBlankLines(content.split(/\r?\n/)).filter(line => !managedLines.has(line.trim()))

  for (const filePath of SEEDED_TEMPLATE_PATHS) {
    lines.push(tracked ? `!${filePath}` : filePath)
  }

  return `${lines.join('\n')}\n`
}

/**
 * Updates `.gitignore` so seeded local files stay ignored.
 */
function main(): void {
  const gitignorePath = path.join(process.cwd(), '.gitignore')
  const packagedGitignorePath = path.join(process.cwd(), 'gitignore')
  const sourceGitignorePath = fs.existsSync(gitignorePath) ? gitignorePath : packagedGitignorePath
  const currentGitignore = fs.existsSync(sourceGitignorePath) ? fs.readFileSync(sourceGitignorePath, 'utf8') : ''

  fs.writeFileSync(gitignorePath, setSeededTemplateFilesTracked(currentGitignore, false))

  if (sourceGitignorePath === packagedGitignorePath && fs.existsSync(packagedGitignorePath)) {
    fs.rmSync(packagedGitignorePath, { force: true })
  }

  console.log('Updated .gitignore to ignore seeded local files.')
}

main()
