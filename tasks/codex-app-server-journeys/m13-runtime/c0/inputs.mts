import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  nativeQualificationInputPaths,
  nativeQualificationSourceFiles,
  type NativeQualificationManifest,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'

/** This task recipe binds the actual trusted controller and SDK factory outside a generated app. */
export function requiredC0TaskInputPaths(canonicalRoot: string) {
  const taskDirectory = path.dirname(fileURLToPath(import.meta.url)),
    producerRoot = path.resolve(taskDirectory, '../../../..')
  const workerRequire = createRequire(path.join(producerRoot, 'packages/appraisejs/package.json'))
  const sdk = workerRequire.resolve('@modelcontextprotocol/sdk/server/index.js'),
    sdkRoot = path.resolve(path.dirname(sdk), '../../..')
  const sdkRequire = createRequire(sdk),
    ajvRoot = path.dirname(sdkRequire.resolve('ajv/package.json'))
  const taskRequire = createRequire(import.meta.url)
  return [
    ...new Set([
      ...nativeQualificationInputPaths(canonicalRoot),
      ...nativeQualificationSourceFiles(taskDirectory),
      ...nativeQualificationSourceFiles(path.join(producerRoot, 'packages/appraisejs/src')),
      ...nativeQualificationSourceFiles(path.join(producerRoot, 'packages/cucumber-runtime/src')),
      ...nativeQualificationSourceFiles(path.join(sdkRoot, 'dist/esm')),
      path.join(sdkRoot, 'package.json'),
      ...nativeQualificationSourceFiles(path.dirname(sdkRequire.resolve('ajv'))),
      path.join(ajvRoot, 'package.json'),
      taskRequire.resolve('tsx'),
      taskRequire.resolve('tsx/package.json'),
      ...['packages/appraisejs/package.json', 'packages/appraisejs/package-lock.json'].map(name =>
        path.join(producerRoot, name),
      ),
    ]),
  ].sort()
}
export function verifyC0TaskInputInventory(manifest: NativeQualificationManifest) {
  const required = requiredC0TaskInputPaths(manifest.repositoryRoot)
  if (
    required.length !== manifest.inputs.length ||
    !manifest.inputs.every((input, index) => input.path === required[index])
  )
    throw new Error('C0 complete task input recipe mismatch')
}
