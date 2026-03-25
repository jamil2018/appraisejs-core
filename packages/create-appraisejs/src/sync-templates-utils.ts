const EXCLUDED_TEMPLATE_PATH_PREFIXES = [
  'automation/features/',
  'automation/locators/',
  'automation/reports/',
] as const

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function shouldExcludeBundledTemplatePath(relativePath: string): boolean {
  const normalizedPath = toPosixPath(relativePath)
  return EXCLUDED_TEMPLATE_PATH_PREFIXES.some(prefix => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix))
}
