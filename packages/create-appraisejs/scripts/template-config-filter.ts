import path from 'node:path'
import { shouldExcludeTemplatePath } from '../../../src/lib/template-path-exclusions'
import { isRepoOnlyTemplatePath } from '../src/template-boundary.js'

export function shouldExcludePreparedConfigPath(relativePath: string): boolean {
  return (
    shouldExcludeTemplatePath(relativePath) ||
    isRepoOnlyTemplatePath(path.posix.join('config', relativePath.replace(/\\/g, '/')))
  )
}
