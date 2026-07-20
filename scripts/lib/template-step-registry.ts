import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { glob } from 'glob'
import { TemplateStepGroupType, TemplateStepIcon } from '@prisma/client'
import { parseStepFile } from './step-file-parser'

export type RegistryStepEntry = {
  slug: string
  sourcePath: string
  sourceSha256: string
  signature: string
  name: string
  description: string | null
  icon: TemplateStepIcon
  group: {
    slug: string
    name: string
    description: string | null
    type: TemplateStepGroupType
  }
}

export type StepRegistryManifest = {
  version: 1
  /** Retained for compatibility when reading older manifests; new manifests are content deterministic. */
  generatedAt?: string
  steps: RegistryStepEntry[]
}

export type StepRegistryFragment = {
  path: string
  content: string
}

export type BuiltStepRegistry = {
  manifest: StepRegistryManifest
  fragments: StepRegistryFragment[]
}

const STEP_FILE_PATTERNS = [
  'automation/steps/actions/**/*.step.ts',
  'automation/steps/validations/**/*.step.ts',
] as const

export function slugifyRegistryName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function renderStepSourceFragment(source: string): string {
  return `${source.trim()}\n`
}

export function createContentSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export async function buildStepRegistry(baseDir: string): Promise<BuiltStepRegistry> {
  const fragments: StepRegistryFragment[] = []
  const steps: RegistryStepEntry[] = []
  const seenSlugs = new Set<string>()
  const seenSourcePaths = new Set<string>()
  const seenSignatures = new Set<string>()

  for (const pattern of STEP_FILE_PATTERNS) {
    const files = await glob(pattern, { cwd: baseDir })

    for (const file of files.sort()) {
      const absolutePath = path.join(baseDir, file)
      const content = await fs.readFile(absolutePath, 'utf8')
      const parsed = parseStepFile(content, file)
      if (!parsed) {
        throw new Error(`Step file is missing a valid group JSDoc: ${file}`)
      }

      const groupSlug = slugifyRegistryName(parsed.group.name)
      if (!groupSlug) {
        throw new Error(`Unable to derive registry slug for step group "${parsed.group.name}" (${file})`)
      }

      for (const step of parsed.steps) {
        const stepSlug = slugifyRegistryName(step.jsdoc.name)
        if (!stepSlug) {
          throw new Error(`Unable to derive registry slug for step "${step.jsdoc.name}" (${file})`)
        }

        const slug = `${groupSlug}/${stepSlug}`
        const sourcePath = path.posix.join('fragments', groupSlug, `${stepSlug}.ts`)
        const fragmentContent = renderStepSourceFragment(step.source)
        const sourceSha256 = createContentSha256(fragmentContent)

        if (seenSlugs.has(slug)) {
          throw new Error(`Duplicate registry slug "${slug}" generated from ${file}`)
        }
        if (seenSourcePaths.has(sourcePath)) {
          throw new Error(`Duplicate registry source path "${sourcePath}" generated from ${file}`)
        }
        if (seenSignatures.has(step.signature)) {
          throw new Error(`Duplicate step signature "${step.signature}" encountered while building the registry`)
        }

        seenSlugs.add(slug)
        seenSourcePaths.add(sourcePath)
        seenSignatures.add(step.signature)

        fragments.push({
          path: sourcePath,
          content: fragmentContent,
        })
        steps.push({
          slug,
          sourcePath,
          sourceSha256,
          signature: step.signature,
          name: step.jsdoc.name,
          description: step.jsdoc.description,
          icon: step.jsdoc.icon,
          group: {
            slug: groupSlug,
            name: parsed.group.name,
            description: parsed.group.description,
            type: parsed.group.type,
          },
        })
      }
    }
  }

  return {
    manifest: {
      version: 1,
      steps: steps.sort((left, right) => left.slug.localeCompare(right.slug)),
    },
    fragments: fragments.sort((left, right) => left.path.localeCompare(right.path)),
  }
}
