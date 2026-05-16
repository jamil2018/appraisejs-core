import { relative } from 'path'

export function getFeatureModulePath(featureFilePath: string, featuresBaseDir: string): string {
  const relativePath = relative(featuresBaseDir, featureFilePath)
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const moduleParts = pathParts.slice(0, -1)

  return moduleParts.length > 0 ? `/${moduleParts.join('/')}` : '/'
}
