export const SEEDED_TEMPLATE_PATHS = ['prisma/dev.db', 'automation/config/environments/environments.json'] as const

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop()
  }
  return trimmed
}

export function setSeededTemplateFilesTracked(content: string, tracked: boolean): string {
  const managedLines = new Set(SEEDED_TEMPLATE_PATHS.flatMap(filePath => [filePath, `!${filePath}`]))
  const lines = trimTrailingBlankLines(content.split(/\r?\n/)).filter(line => !managedLines.has(line.trim()))

  for (const filePath of SEEDED_TEMPLATE_PATHS) {
    lines.push(tracked ? `!${filePath}` : filePath)
  }

  return `${lines.join('\n')}\n`
}

export function getEmptyEnvironmentsFileContent(): string {
  return '{}\n'
}
