const EXCLUDED_TEMPLATE_PATH_PREFIXES = [
  'automation/features/',
  'automation/locators/',
  'automation/reports/',
] as const
const EXCLUDED_TEMPLATE_FILENAMES = new Set(['.DS_Store'])

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function shouldExcludeBundledTemplatePath(relativePath: string): boolean {
  const normalizedPath = toPosixPath(relativePath)
  const parts = normalizedPath.split('/')
  return (
    parts.some(part => EXCLUDED_TEMPLATE_FILENAMES.has(part)) ||
    EXCLUDED_TEMPLATE_PATH_PREFIXES.some(
      prefix => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix),
    )
  )
}
