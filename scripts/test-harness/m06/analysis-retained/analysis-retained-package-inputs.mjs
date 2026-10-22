// Static installed-runtime inventory only. No package is imported/evaluated by this reader.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
/**
 * @param {Iterable<string>} externalImports
 * @param {{root: string, clientEntry: string}} options
 * @param {{existsSync: (filename: string) => boolean, realpathSync: (filename: string) => string,
 * readFileSync: (filename: string, encoding: 'utf8') => string,
 * readdirSync: (filename: string, options: {withFileTypes: true}) => Array<{name: string,
 * isDirectory: () => boolean, isFile: () => boolean, isSymbolicLink: () => boolean}>,
 * lstatSync: (filename: string) => {size: number, mode: number}}} io
 */
export function collectAnalysisRuntimePackageInputs(externalImports, { root, clientEntry }, io = fs) {
  const { existsSync, realpathSync, readFileSync, readdirSync, lstatSync } = io
  const installedRoots = [
    realpathSync(path.join(root, 'node_modules')),
    realpathSync(path.resolve(root, '../../../..', 'node_modules')),
  ]
  const packageDirectories = new Set()
  const packageFiles = new Set()
  const excludedPackageInputs = []
  const packageDependencyEdges = []
  function resolvePackageDirectory(packageName, from, optional, declared) {
    const lookup = createRequire(path.join(from, 'package.json')).resolve.paths(packageName) ?? []
    const found = lookup
      .filter(directory => installedRoots.some(known => directory === known || directory.startsWith(known + path.sep)))
      .map(directory => path.join(directory, packageName))
      .find(directory => existsSync(path.join(directory, 'package.json')))
    if (!found && optional) return null
    assert.ok(found, 'Installed external package unavailable: ' + packageName)
    const directory = realpathSync(found)
    assert.ok(
      installedRoots.some(known => directory.startsWith(known + path.sep)),
      'Package escaped known installed root: ' + directory,
    )
    const alias = declared?.match(/^npm:((?:@[^/]+\/)?[^@]+)@.+$/)
    const actualName = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).name
    assert.equal(actualName, alias?.[1] ?? packageName)
    packageDependencyEdges.push({ specifier: packageName, from, declared: declared ?? null, directory, actualName })
    return directory
  }
  function inventoryRuntimePackage(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      const forbidden =
        /^\.env(?:\.|$)|^\.(?:npmrc|netrc|aws|ssh)$|^id_(?:rsa|ed25519)|\.(?:pem|key|p12)$|\.(?:db|sqlite|sqlite3)(?:-|$)|-(?:wal|shm)$/.test(
          entry.name,
        )
      if (forbidden || entry.isSymbolicLink()) {
        const info = lstatSync(filename)
        excludedPackageInputs.push({
          filename,
          kind: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          bytes: info.size,
          mode: info.mode & 0o777,
          reason: 'NON_RUNTIME_CANDIDATE_METADATA_ONLY',
        })
      } else if (entry.isDirectory()) inventoryRuntimePackage(filename)
      else {
        assert.ok(entry.isFile())
        packageFiles.add(filename)
      }
    }
  }
  function bindPackage(specifier, from, optional = false, declared) {
    if (specifier.startsWith('node:') || builtinModules.includes(specifier) || specifier === clientEntry) return
    const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
    const directory = resolvePackageDirectory(packageName, from, optional, declared)
    if (!directory || packageDirectories.has(directory)) return
    packageDirectories.add(directory)
    inventoryRuntimePackage(directory)
    bindPackageDependencies(directory)
  }
  function bindPackageDependencies(directory) {
    const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
    for (const dependency of Object.keys(metadata.dependencies ?? {}))
      bindPackage(dependency, directory, false, metadata.dependencies[dependency])
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {}))
      bindPackage(dependency, directory, true, metadata.optionalDependencies[dependency])
  }
  for (const specifier of externalImports) bindPackage(specifier, root)
  return { installedRoots, packageFiles, excludedPackageInputs, packageDependencyEdges }
}
