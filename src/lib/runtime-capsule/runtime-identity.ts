import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const hash = (value: Buffer | string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

async function nearestPackageJson(filePath: string) {
  let current = path.dirname(filePath)
  while (true) {
    const candidate = path.join(current, 'package.json')
    try {
      const bytes = await fs.readFile(candidate)
      const parsed = JSON.parse(bytes.toString()) as { name?: unknown; version?: unknown }
      if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string')
        throw new Error(`Package identity at ${candidate} has no name or version.`)
      return {
        root: await fs.realpath(current),
        packageJsonHash: hash(bytes),
        name: parsed.name,
        version: parsed.version,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`No package.json owns runtime path ${filePath}.`)
    current = parent
  }
}

async function physicalFile(filePath: string) {
  const realPath = await fs.realpath(filePath)
  const stat = await fs.lstat(realPath)
  if (!stat.isFile()) throw new Error(`Runtime identity path is not a regular file: ${filePath}`)
  return { realPath, hash: hash(await fs.readFile(realPath)) }
}

export async function resolveCapsuleRuntimeIdentity(input: {
  nodeExecutable?: string
  cucumberBinaryPath: string
  cucumberModulePath: string
  appraiseRuntimeModulePath: string
  appraiseRuntimeHooksPath: string
  additionalCucumberModulePaths?: string[]
}) {
  const node = await physicalFile(input.nodeExecutable ?? process.execPath)
  if (node.realPath !== (await fs.realpath(process.execPath)))
    throw new Error('Capsule command receipts v1 must use the current Appraise Node executable.')
  const cucumberBinary = await physicalFile(input.cucumberBinaryPath)
  const cucumberModule = await physicalFile(input.cucumberModulePath)
  const appraiseRuntime = await physicalFile(input.appraiseRuntimeModulePath)
  const appraiseHooks = await physicalFile(input.appraiseRuntimeHooksPath)
  const [cucumberPackage, cucumberBinaryPackage, appraisePackage, appraiseHooksPackage, ...additionalPackages] =
    await Promise.all([
      nearestPackageJson(cucumberModule.realPath),
      nearestPackageJson(cucumberBinary.realPath),
      nearestPackageJson(appraiseRuntime.realPath),
      nearestPackageJson(appraiseHooks.realPath),
      ...(input.additionalCucumberModulePaths ?? []).map(async value =>
        nearestPackageJson((await physicalFile(value)).realPath),
      ),
    ])
  const roots = [cucumberPackage.root, ...additionalPackages.map(item => item.root)]
  if (
    cucumberPackage.name !== '@cucumber/cucumber' ||
    cucumberBinaryPackage.name !== '@cucumber/cucumber' ||
    appraisePackage.name !== '@appraise/cucumber-runtime' ||
    appraiseHooksPackage.name !== '@appraise/cucumber-runtime' ||
    appraiseHooksPackage.root !== appraisePackage.root ||
    additionalPackages.some(item => item.name !== '@cucumber/cucumber')
  )
    throw new Error('Runtime package identity does not match the required Appraise and Cucumber packages.')
  if (cucumberBinaryPackage.root !== cucumberPackage.root || new Set(roots).size !== 1)
    throw new Error('Runtime resolves more than one physical Cucumber package instance.')
  return {
    node: { ...node, version: process.version, platform: process.platform, arch: process.arch },
    cucumber: {
      ...cucumberModule,
      version: cucumberPackage.version,
      packageRootRealPath: cucumberPackage.root,
      packageJsonHash: cucumberPackage.packageJsonHash,
      binaryRealPath: cucumberBinary.realPath,
      binaryHash: cucumberBinary.hash,
      singletonKey: hash(`${cucumberPackage.root}\0${cucumberPackage.version}\0${cucumberModule.hash}`),
    },
    appraiseRuntime: {
      ...appraiseRuntime,
      version: appraisePackage.version,
      packageRootRealPath: appraisePackage.root,
      packageJsonHash: appraisePackage.packageJsonHash,
    },
    appraiseHooks: {
      ...appraiseHooks,
      version: appraiseHooksPackage.version,
      packageRootRealPath: appraiseHooksPackage.root,
      packageJsonHash: appraiseHooksPackage.packageJsonHash,
    },
  }
}
