import fs from 'fs-extra'
import path from 'path'
import cliProgress from 'cli-progress'
import type { PackageManager } from './prompts.js'
import { DEFAULT_TEMPLATE_ID, resolveBundledTemplatePath, type TemplateId } from './template-catalog.js'

const SEEDED_DB_PATH = path.join('prisma', 'dev.db')
const PACKAGED_GITIGNORE_PATH = 'gitignore'

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git'])
const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.*.local',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.DS_Store',
])
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3'])

function shouldKeepSeededDatabase(relativePath: string): boolean {
  return relativePath.replace(/\\/g, '/') === SEEDED_DB_PATH
}

function shouldExclude(relativePath: string, name: string, stat: fs.Stats, packageManager?: PackageManager): boolean {
  if (EXCLUDED_DIRS.has(name)) return true
  if (stat.isFile()) {
    if (EXCLUDED_FILES.has(name)) {
      if (packageManager === 'npm' && name === 'package-lock.json') return false
      return true
    }
    const ext = path.extname(name)
    if (EXCLUDED_EXTENSIONS.has(ext) && !shouldKeepSeededDatabase(relativePath)) return true
    if (name.startsWith('.env') && name !== '.env.example') return true
  }
  return false
}

function collectFiles(src: string, base = '', packageManager?: PackageManager): string[] {
  const resolvedSrc = path.resolve(src)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(resolvedSrc, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const ent of entries) {
    const rel = base ? path.join(base, ent.name) : ent.name
    const full = path.resolve(resolvedSrc, ent.name)
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(full)
    } catch {
      continue
    }
    if (shouldExclude(rel, ent.name, stat, packageManager)) continue
    if (stat.isSymbolicLink()) {
      files.push(rel)
      continue
    }
    if (stat.isDirectory()) {
      files.push(...collectFiles(full, rel, packageManager))
    } else if (stat.isFile()) {
      files.push(rel)
    }
  }
  return files
}

export function getCollectedFilesForTest(src: string, packageManager?: PackageManager): string[] {
  return collectFiles(src, '', packageManager)
}

export function getTemplatePath(template: TemplateId = DEFAULT_TEMPLATE_ID): string {
  return resolveBundledTemplatePath(template)
}

function getDestinationRelativePath(relativePath: string): string {
  return relativePath === PACKAGED_GITIGNORE_PATH ? '.gitignore' : relativePath
}

export async function copyTemplate(
  destDir: string,
  onProgress?: (current: number, total: number, filename: string) => void,
  templatePathOverride?: string,
  packageManager?: PackageManager,
  template: TemplateId = DEFAULT_TEMPLATE_ID,
): Promise<void> {
  const templatePath = templatePathOverride ?? getTemplatePath(template)
  if (!(await fs.pathExists(templatePath))) {
    throw new Error(`Template not found at: ${templatePath}`)
  }

  await fs.ensureDir(destDir)
  const files = collectFiles(templatePath, '', packageManager)
  const total = files.length

  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Copying template files | {bar} | {percentage}% | {value}/{total} files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  )
  progressBar.start(total, 0)

  for (let i = 0; i < files.length; i++) {
    const rel = files[i]
    const srcFile = path.join(templatePath, rel)
    const destFile = path.join(destDir, getDestinationRelativePath(rel))
    await fs.ensureDir(path.dirname(destFile))
    await fs.copy(srcFile, destFile)
    progressBar.update(i + 1, { filename: rel })
    onProgress?.(i + 1, total, rel)
  }

  progressBar.stop()
}
