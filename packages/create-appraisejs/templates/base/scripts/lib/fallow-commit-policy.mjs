const fallowSuppression = /^(?:\/\/|\/\*)\s*fallow-ignore(?:-next-line|-file)?\b/

export function requiresReleaseBaselineAudit(stagedPatch) {
  let removedSuppression = false

  for (const line of stagedPatch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    const content = line.slice(1).trim()
    if (line.startsWith('+') && fallowSuppression.test(content)) return false
    if (line.startsWith('-') && fallowSuppression.test(content)) removedSuppression = true
  }

  return removedSuppression
}
