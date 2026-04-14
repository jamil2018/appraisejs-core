/**
 * Splits a tag line that may contain multiple tags separated by spaces.
 * Example: "@smoke @demo" -> ["@smoke", "@demo"]
 */
export function splitTagLine(tagLine: string): string[] {
  return tagLine
    .split(/\s+/)
    .filter(tag => tag.trim().startsWith('@'))
    .map(tag => tag.trim())
}
