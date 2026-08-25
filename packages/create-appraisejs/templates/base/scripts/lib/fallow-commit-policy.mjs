const fallowSuppression = /^(?:\/\/|\/\*)\s*fallow-ignore(?:-next-line|-file)?\b/
const RELEASE_SCALE_FILE_COUNT = 100

export function requiresReleaseBaselineAudit(stagedPatch, stagedFiles = '') {
  let removedSuppression = false
  let addedSuppression = false
  const changedFiles = new Set()

  for (const line of stagedPatch.split('\n')) {
    const diffHeader = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (diffHeader) changedFiles.add(diffHeader[2])
    if (line.startsWith('+++') || line.startsWith('---')) continue
    const content = line.slice(1).trim()
    if (line.startsWith('+') && fallowSuppression.test(content)) addedSuppression = true
    if (line.startsWith('-') && fallowSuppression.test(content)) removedSuppression = true
  }

  for (const file of stagedFiles.split('\n')) {
    if (file.trim()) changedFiles.add(file.trim())
  }

  if (changedFiles.size >= RELEASE_SCALE_FILE_COUNT) return true
  return removedSuppression && !addedSuppression
}
