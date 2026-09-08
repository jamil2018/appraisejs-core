const documentationPattern = /^(?:docs|tasks)\/.+\.md$|^[^/]+\.md$/
const configurationPattern =
  /^(?:package(?:-lock)?\.json|\.github\/|\.agents\/|\.codex\/|prisma\/|packages\/|tsconfig[^/]*\.json|next\.config\.|eslint\.config\.|\.eslintrc|\.fallowrc\.json|react-doctor\.config\.json)/

/**
 * Code-analysis hooks may skip a commit only when every affected path is
 * documentation and none is a dependency, instruction, or tool configuration.
 */
export function isStrictlyDocumentationOnly(changes) {
  const paths = changes.flatMap(change => [change.oldPath, change.path].filter(Boolean))
  return (
    paths.length > 0 &&
    paths.every(pathname => documentationPattern.test(pathname) && !configurationPattern.test(pathname))
  )
}
