import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

const inputPaths = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'packages/cucumber-runtime/package.json',
  'packages/cucumber-runtime/tsconfig.json',
]

export function cucumberRuntimeInputFingerprint(root) {
  return fingerprintEntries(root, [...inputPaths, ...walk(path.join(root, 'packages/cucumber-runtime/src'))])
}

export function cucumberRuntimeArtifactFingerprint(root) {
  const dist = path.join(root, 'packages/cucumber-runtime/dist')
  if (!existsSync(path.join(dist, 'index.js'))) throw new Error('Cucumber runtime artifact is missing dist/index.js.')
  return fingerprintEntries(root, walk(dist))
}

export function cucumberRuntimeReceiptIsCurrent(root, receiptPath, nodeVersion = process.version) {
  if (!receiptPath || !path.isAbsolute(receiptPath)) return false
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    return (
      receipt.version === 1 &&
      receipt.nodeVersion === nodeVersion &&
      receipt.inputFingerprint === cucumberRuntimeInputFingerprint(root) &&
      receipt.artifactFingerprint === cucumberRuntimeArtifactFingerprint(root)
    )
  } catch {
    return false
  }
}

function fingerprintEntries(root, files) {
  const hash = createHash('sha256')
  for (const file of files.map(file => path.resolve(root, file)).sort()) {
    const relative = path.relative(root, file).replace(/\\/g, '/')
    const stat = lstatSync(file)
    hash.update(relative)
    if (stat.isSymbolicLink()) {
      const target = realpathSync(file)
      if (path.relative(root, target).startsWith('..'))
        throw new Error(`Refusing to cache an external symlink input: ${relative}`)
    }
    hash.update(readFileSync(file))
  }
  return hash.digest('hex')
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(fullPath))
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(fullPath)
  }
  return files
}
