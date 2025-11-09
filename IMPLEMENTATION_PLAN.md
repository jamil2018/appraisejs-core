# File-Based Entity Sync - Implementation Plan

## Overview

This plan implements a simple, reliable file-scan based synchronization system using a file modification time (mtime) cache for efficient incremental syncs. The approach prioritizes simplicity and reliability over complex metadata tracking.

## Architecture Principles

1. **Files are Source of Truth**: Entity files (`.feature`, `.json`, `.step.ts`) are authoritative
2. **Simple Cache for Performance**: Track file modification times to skip unchanged files
3. **No Merge Conflicts**: Cache is gitignored, avoiding merge complexity
4. **Reliable Matching**: Use name/path/signature-based matching to find/create entities in DB
5. **Fast Incremental**: Only process files that have changed since last sync

---

## File Structure

```
src/tests/
  .appraise/                    ← Gitignored sync directory
    cache.json                  ← File modification time cache
    sync-state.json             ← Optional: sync history/logs
  features/
    example/
      example.feature
  locators/
    home/
      home.json
  config/
    environments/
      environments.json
  steps/
    action/
      click.action.step.ts
```

**Note**: No `.meta.json` files - cache is gitignored and regenerated as needed.

---

## Performance Estimates

### Repository Scale

- **50-60** feature files (Gherkin)
- **~100** locator files (JSON)
- **20-30** step definition files (TypeScript)
- **150-200** template steps total
- **~170-190** total files

### Sync Performance

- **Full Sync**: ~4 seconds (first time, force refresh)
- **Incremental Sync (typical)**: ~0.4 seconds (3-5 changed files)
- **Incremental Sync (worst case)**: ~1.2 seconds (20 changed files)

---

## Phase 1: Core Infrastructure

### Step 1.1: Cache Types & Utilities

**File: `src/lib/sync/types.ts`**

```typescript
/**
 * File cache entry tracking modification time and hash
 */
export interface FileCacheEntry {
  mtime: number // File modification time (milliseconds since epoch)
  hash: string // SHA-256 hash of file content
}

/**
 * Complete file cache structure
 */
export interface FileCache {
  version: number
  lastSync: string // ISO 8601 timestamp
  files: {
    [filePath: string]: FileCacheEntry // Relative path from src/tests
  }
}

/**
 * Sync result summary
 */
export interface SyncResult {
  scanned: number
  changed: number
  synced: {
    features: number
    locators: number
    templateSteps: number
    environments: number
  }
  errors: string[]
  duration: number // milliseconds
}
```

---

### Step 1.2: Cache Manager

**File: `src/lib/sync/cache-manager.ts`**

```typescript
import { promises as fs } from 'fs'
import { join } from 'path'
import { calculateFileHash } from './hash-utils'
import type { FileCache, FileCacheEntry } from './types'

const CACHE_PATH = join(process.cwd(), 'src', 'tests', '.appraise', 'cache.json')

/**
 * Ensures .appraise directory exists
 */
async function ensureAppraiseDir(): Promise<void> {
  const dir = join(process.cwd(), 'src', 'tests', '.appraise')
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Reads the file cache
 */
export async function readCache(): Promise<FileCache> {
  try {
    await ensureAppraiseDir()
    const content = await fs.readFile(CACHE_PATH, 'utf-8')
    return JSON.parse(content) as FileCache
  } catch {
    // Cache doesn't exist - return empty cache
    return {
      version: 1,
      lastSync: new Date(0).toISOString(),
      files: {},
    }
  }
}

/**
 * Writes the file cache
 */
export async function writeCache(cache: FileCache): Promise<void> {
  await ensureAppraiseDir()
  cache.lastSync = new Date().toISOString()
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8')
}

/**
 * Updates cache entry for a file
 */
export async function updateCacheEntry(filePath: string, mtime: number, hash: string): Promise<void> {
  const cache = await readCache()
  cache.files[filePath] = { mtime, hash }
  await writeCache(cache)
}

/**
 * Gets cache entry for a file
 */
export async function getCacheEntry(filePath: string): Promise<FileCacheEntry | null> {
  const cache = await readCache()
  return cache.files[filePath] || null
}

/**
 * Clears the cache (for full sync)
 */
export async function clearCache(): Promise<void> {
  const cache = await readCache()
  cache.files = {}
  cache.lastSync = new Date().toISOString()
  await writeCache(cache)
}
```

---

### Step 1.3: Hash Utilities

**File: `src/lib/sync/hash-utils.ts`**

```typescript
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { stat } from 'fs/promises'

/**
 * Calculates SHA-256 hash of file content
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8')
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Gets file modification time in milliseconds
 */
export async function getFileMtime(filePath: string): Promise<number> {
  const stats = await stat(filePath)
  return stats.mtime.getTime()
}

/**
 * Checks if file has changed based on cache entry
 */
export async function hasFileChanged(filePath: string, cacheEntry: { mtime: number; hash: string }): Promise<boolean> {
  try {
    const currentMtime = await getFileMtime(filePath)

    // Fast path: if mtime unchanged, file hasn't changed
    if (currentMtime === cacheEntry.mtime) {
      return false
    }

    // mtime changed - verify with hash (handles edge cases like file restore)
    const currentHash = await calculateFileHash(filePath)
    return currentHash !== cacheEntry.hash
  } catch {
    // File doesn't exist or error - treat as changed
    return true
  }
}
```

---

### Step 1.4: File Scanner

**File: `src/lib/sync/file-scanner.ts`**

```typescript
import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import { getCacheEntry, getFileMtime, calculateFileHash, hasFileChanged } from './cache-manager'
import type { FileCacheEntry } from './types'

export interface ScannedFile {
  filePath: string
  relativePath: string
  entityType: 'feature' | 'locator' | 'template-step' | 'environment'
  cacheEntry: FileCacheEntry | null
  hasChanged: boolean
}

/**
 * Scans all entity files and checks for changes
 */
export async function scanEntityFiles(): Promise<ScannedFile[]> {
  const testsDir = join(process.cwd(), 'src', 'tests')
  const scannedFiles: ScannedFile[] = []

  // Scan feature files
  const featureFiles = await glob('features/**/*.feature', { cwd: testsDir })
  for (const file of featureFiles) {
    const fullPath = join(testsDir, file)
    const cacheEntry = await getCacheEntry(file)
    let hasChanged = true

    if (cacheEntry) {
      hasChanged = await hasFileChanged(fullPath, cacheEntry)
    }

    scannedFiles.push({
      filePath: fullPath,
      relativePath: file,
      entityType: 'feature',
      cacheEntry,
      hasChanged,
    })
  }

  // Scan locator files
  const locatorFiles = await glob('locators/**/*.json', { cwd: testsDir })
  for (const file of locatorFiles) {
    const fullPath = join(testsDir, file)
    const cacheEntry = await getCacheEntry(file)
    let hasChanged = true

    if (cacheEntry) {
      hasChanged = await hasFileChanged(fullPath, cacheEntry)
    }

    scannedFiles.push({
      filePath: fullPath,
      relativePath: file,
      entityType: 'locator',
      cacheEntry,
      hasChanged,
    })
  }

  // Scan template step files
  const stepFiles = await glob('steps/**/*.step.ts', { cwd: testsDir })
  for (const file of stepFiles) {
    const fullPath = join(testsDir, file)
    const cacheEntry = await getCacheEntry(file)
    let hasChanged = true

    if (cacheEntry) {
      hasChanged = await hasFileChanged(fullPath, cacheEntry)
    }

    scannedFiles.push({
      filePath: fullPath,
      relativePath: file,
      entityType: 'template-step',
      cacheEntry,
      hasChanged,
    })
  }

  // Scan environment file
  const envFile = join(testsDir, 'config', 'environments', 'environments.json')
  try {
    await fs.access(envFile)
    const cacheEntry = await getCacheEntry('config/environments/environments.json')
    let hasChanged = true

    if (cacheEntry) {
      hasChanged = await hasFileChanged(envFile, cacheEntry)
    }

    scannedFiles.push({
      filePath: envFile,
      relativePath: 'config/environments/environments.json',
      entityType: 'environment',
      cacheEntry,
      hasChanged,
    })
  } catch {
    // File doesn't exist
  }

  return scannedFiles
}

/**
 * Gets files that need syncing (have changed)
 */
export function getFilesNeedingSync(scannedFiles: ScannedFile[]): ScannedFile[] {
  return scannedFiles.filter(f => f.hasChanged)
}
```

---

## Phase 2: Sync Handlers

### Step 2.1: Feature File Sync

**File: `src/lib/sync/handlers/feature-sync.ts`**

```typescript
import { parseFeatureFile, scanFeatureFiles } from '@/lib/gherkin-parser'
import { mergeScenariosWithExistingTestSuites } from '@/lib/database-sync'
import { join } from 'path'
import type { ScannedFile } from '../file-scanner'

/**
 * Syncs feature files to database
 */
export async function syncFeaturesToDatabase(files: ScannedFile[]): Promise<{
  synced: number
}> {
  if (files.length === 0) return { synced: 0 }

  const featuresBaseDir = join(process.cwd(), 'src', 'tests', 'features')
  const parsedFeatures = await scanFeatureFiles(featuresBaseDir)

  const result = await mergeScenariosWithExistingTestSuites(parsedFeatures, featuresBaseDir)

  return {
    synced: result.mergedTestSuites,
  }
}
```

---

### Step 2.2: Locator File Sync

**File: `src/lib/sync/handlers/locator-sync.ts`**

```typescript
import { promises as fs } from 'fs'
import prisma from '@/config/db-config'
import { buildModuleHierarchy } from '@/lib/module-hierarchy-builder'
import { relative, join, dirname } from 'path'
import type { ScannedFile } from '../file-scanner'

/**
 * Extracts module path from locator file path
 */
function extractModulePathFromLocatorFile(filePath: string): string {
  const testsDir = join(process.cwd(), 'src', 'tests')
  const relativePath = relative(testsDir, filePath)
  const pathParts = relativePath.split(/[/\\]/).filter(p => p && p !== 'locators')
  const moduleParts = pathParts.slice(0, -1) // Remove filename
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

/**
 * Extracts locator group name from file path
 */
function extractLocatorGroupName(filePath: string): string {
  const baseName = relative(join(process.cwd(), 'src', 'tests', 'locators'), filePath)
  return baseName.replace(/\.json$/, '').replace(/[/\\]/g, '/')
}

/**
 * Syncs locator files to database
 */
export async function syncLocatorsToDatabase(files: ScannedFile[]): Promise<{
  synced: number
}> {
  let synced = 0

  for (const file of files) {
    try {
      // Read locator file
      const content = await fs.readFile(file.filePath, 'utf-8')
      const locators = JSON.parse(content) as Record<string, string>

      // Extract module path and group name
      const modulePath = extractModulePathFromLocatorFile(file.filePath)
      const moduleId = await buildModuleHierarchy(modulePath)
      const groupName = extractLocatorGroupName(file.filePath)

      // Find or create locator group
      let locatorGroup = await prisma.locatorGroup.findFirst({
        where: {
          name: groupName,
          moduleId: moduleId,
        },
      })

      if (!locatorGroup) {
        locatorGroup = await prisma.locatorGroup.create({
          data: {
            name: groupName,
            route: `/${groupName}`,
            moduleId: moduleId,
          },
        })
      }

      // Sync locators
      for (const [locatorName, locatorValue] of Object.entries(locators)) {
        await prisma.locator.upsert({
          where: {
            id: `${locatorGroup.id}-${locatorName}`, // Simple unique key
          },
          create: {
            name: locatorName,
            value: locatorValue,
            locatorGroupId: locatorGroup.id,
          },
          update: {
            value: locatorValue,
          },
        })
      }

      synced++
    } catch (error) {
      console.error(`Error syncing locator file ${file.filePath}:`, error)
    }
  }

  return { synced }
}
```

---

### Step 2.3: Template Step Sync

**File: `src/lib/sync/handlers/template-step-sync.ts`**

```typescript
import { promises as fs } from 'fs'
import prisma from '@/config/db-config'
import { basename } from 'path'
import type { ScannedFile } from '../file-scanner'

/**
 * Parses template step file to extract signatures
 */
async function parseTemplateStepFile(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8')
  const signatures: string[] = []

  // Match When('signature', ...) patterns
  const whenPattern = /When\s*\(\s*['"](.*?)['"]/g
  let match
  while ((match = whenPattern.exec(content)) !== null) {
    signatures.push(match[1])
  }

  return signatures
}

/**
 * Extracts group name from file path
 */
function extractGroupName(filePath: string): string {
  const fileName = basename(filePath, '.step.ts')
  // Remove category prefix if present (e.g., "click.action" -> "click")
  return fileName.split('.')[0]
}

/**
 * Infers step type and icon from signature
 */
function inferStepTypeFromSignature(signature: string): {
  type: 'ACTION' | 'ASSERTION' | 'FLOW_CONTROL'
  icon: string
} {
  const lower = signature.toLowerCase()
  if (lower.includes('click') || lower.includes('press')) {
    return { type: 'ACTION', icon: 'MOUSE' }
  }
  if (lower.includes('should') || lower.includes('verify') || lower.includes('assert')) {
    return { type: 'ASSERTION', icon: 'VALIDATION' }
  }
  if (lower.includes('navigate') || lower.includes('go to')) {
    return { type: 'ACTION', icon: 'NAVIGATION' }
  }
  return { type: 'ACTION', icon: 'MOUSE' }
}

/**
 * Syncs template step files to database
 */
export async function syncTemplateStepsToDatabase(files: ScannedFile[]): Promise<{
  synced: number
}> {
  let synced = 0

  for (const file of files) {
    try {
      // Parse file to get signatures
      const signatures = await parseTemplateStepFile(file.filePath)

      // Find or create template step group
      const groupName = extractGroupName(file.filePath)
      let group = await prisma.templateStepGroup.findFirst({
        where: { name: groupName },
      })

      if (!group) {
        group = await prisma.templateStepGroup.create({
          data: {
            name: groupName,
            description: 'Auto-synced from file',
          },
        })
      }

      // Process each signature
      for (const signature of signatures) {
        let step = await prisma.templateStep.findFirst({
          where: {
            signature: signature,
            templateStepGroupId: group.id,
          },
        })

        if (!step) {
          const { type, icon } = inferStepTypeFromSignature(signature)
          step = await prisma.templateStep.create({
            data: {
              signature,
              name: signature.substring(0, 50),
              description: `Auto-synced: ${signature}`,
              type,
              icon: icon as any,
              templateStepGroupId: group.id,
            },
          })
          synced++
        }
      }
    } catch (error) {
      console.error(`Error syncing template step file ${file.filePath}:`, error)
    }
  }

  return { synced }
}
```

---

### Step 2.4: Environment Sync

**File: `src/lib/sync/handlers/environment-sync.ts`**

```typescript
import { promises as fs } from 'fs'
import { join } from 'path'
import prisma from '@/config/db-config'

/**
 * Syncs environments.json to database
 */
export async function syncEnvironmentsToDatabase(): Promise<{
  synced: number
}> {
  const envFile = join(process.cwd(), 'src', 'tests', 'config', 'environments', 'environments.json')

  try {
    await fs.access(envFile)
  } catch {
    return { synced: 0 } // File doesn't exist
  }

  const content = await fs.readFile(envFile, 'utf-8')
  const environments = JSON.parse(content) as Record<
    string,
    {
      baseUrl: string
      apiBaseUrl?: string
      email?: string
      password?: string
    }
  >

  let synced = 0

  for (const [envKey, envData] of Object.entries(environments)) {
    const envName = envKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

    await prisma.environment.upsert({
      where: { name: envName },
      create: {
        name: envName,
        baseUrl: envData.baseUrl,
        apiBaseUrl: envData.apiBaseUrl || null,
        username: envData.email || null,
        password: envData.password || null,
      },
      update: {
        baseUrl: envData.baseUrl,
        apiBaseUrl: envData.apiBaseUrl || null,
        username: envData.email || null,
        password: envData.password || null,
      },
    })

    synced++
  }

  return { synced }
}
```

---

## Phase 3: Sync Orchestrator

### Step 3.1: Main Sync Orchestrator

**File: `src/lib/sync/sync-orchestrator.ts`**

```typescript
import { scanEntityFiles, getFilesNeedingSync } from './file-scanner'
import { syncFeaturesToDatabase } from './handlers/feature-sync'
import { syncLocatorsToDatabase } from './handlers/locator-sync'
import { syncTemplateStepsToDatabase } from './handlers/template-step-sync'
import { syncEnvironmentsToDatabase } from './handlers/environment-sync'
import { updateCacheEntry, getFileMtime, calculateFileHash } from './cache-manager'
import type { SyncResult, ScannedFile } from './types'

/**
 * Performs full sync from filesystem to database
 */
export async function performFileToDbSync(forceFull: boolean = false): Promise<SyncResult> {
  const startTime = Date.now()
  const result: SyncResult = {
    scanned: 0,
    changed: 0,
    synced: {
      features: 0,
      locators: 0,
      templateSteps: 0,
      environments: 0,
    },
    errors: [],
    duration: 0,
  }

  try {
    console.log('🔄 Starting filesystem to database sync...')

    // Scan all files
    const scannedFiles = await scanEntityFiles()
    result.scanned = scannedFiles.length

    // Get files that need syncing
    const filesToSync = forceFull ? scannedFiles : getFilesNeedingSync(scannedFiles)
    result.changed = filesToSync.length

    console.log(`📁 Scanned ${result.scanned} files, ${result.changed} changed`)

    if (filesToSync.length === 0) {
      console.log('✅ No changes detected - sync complete')
      result.duration = Date.now() - startTime
      return result
    }

    // Group files by type
    const featureFiles = filesToSync.filter(f => f.entityType === 'feature')
    const locatorFiles = filesToSync.filter(f => f.entityType === 'locator')
    const stepFiles = filesToSync.filter(f => f.entityType === 'template-step')
    const envFiles = filesToSync.filter(f => f.entityType === 'environment')

    // Sync features
    if (featureFiles.length > 0) {
      const featureResult = await syncFeaturesToDatabase(featureFiles)
      result.synced.features = featureResult.synced
    }

    // Sync locators
    if (locatorFiles.length > 0) {
      const locatorResult = await syncLocatorsToDatabase(locatorFiles)
      result.synced.locators = locatorResult.synced
    }

    // Sync template steps
    if (stepFiles.length > 0) {
      const stepResult = await syncTemplateStepsToDatabase(stepFiles)
      result.synced.templateSteps = stepResult.synced
    }

    // Sync environments
    if (envFiles.length > 0) {
      const envResult = await syncEnvironmentsToDatabase()
      result.synced.environments = envResult.synced
    }

    // Update cache for all synced files
    for (const file of filesToSync) {
      try {
        const mtime = await getFileMtime(file.filePath)
        const hash = await calculateFileHash(file.filePath)
        await updateCacheEntry(file.relativePath, mtime, hash)
      } catch (error) {
        result.errors.push(`Failed to update cache for ${file.relativePath}: ${error}`)
      }
    }

    result.duration = Date.now() - startTime

    console.log('\n✅ Sync completed!')
    console.log(`📊 Summary:`)
    console.log(`   - Scanned: ${result.scanned} files`)
    console.log(`   - Changed: ${result.changed} files`)
    console.log(`   - Features synced: ${result.synced.features}`)
    console.log(`   - Locators synced: ${result.synced.locators}`)
    console.log(`   - Template steps synced: ${result.synced.templateSteps}`)
    console.log(`   - Environments synced: ${result.synced.environments}`)
    console.log(`   - Duration: ${(result.duration / 1000).toFixed(2)}s`)

    if (result.errors.length > 0) {
      console.log(`   - Errors: ${result.errors.length}`)
      result.errors.forEach(error => console.log(`     - ${error}`))
    }

    return result
  } catch (error) {
    const errorMsg = `Fatal error during sync: ${error}`
    console.error(errorMsg)
    result.errors.push(errorMsg)
    result.duration = Date.now() - startTime
    return result
  }
}
```

---

## Phase 4: CLI & Scripts

### Step 4.1: Sync Script

**File: `scripts/sync-entities.ts`**

```typescript
#!/usr/bin/env tsx
import { performFileToDbSync } from '@/lib/sync/sync-orchestrator'

async function main() {
  const args = process.argv.slice(2)
  const forceFull = args.includes('--full')

  console.log(forceFull ? '🔄 Performing full sync...' : '🔄 Performing incremental sync...')

  const result = await performFileToDbSync(forceFull)

  if (result.errors.length > 0) {
    console.error('\n❌ Errors occurred during sync')
    process.exit(1)
  }

  console.log(`\n✅ Sync completed in ${(result.duration / 1000).toFixed(2)}s`)
}

main()
```

---

### Step 4.2: Update package.json

```json
{
  "scripts": {
    "sync-entities": "tsx scripts/sync-entities.ts",
    "sync-entities:full": "tsx scripts/sync-entities.ts --full"
  }
}
```

---

### Step 4.3: Git Hook (Optional)

**File: `.husky/post-merge`**

```bash
#!/bin/sh
# Run entity sync after git merge (optional - users can disable)

echo "🔄 Syncing entities after merge..."
npm run sync-entities
```

---

### Step 4.4: Update .gitignore

```gitignore
# Appraise sync cache
src/tests/.appraise/
```

---

## Phase 5: Integration Points

### Step 5.1: Integration with Existing Actions (Optional)

If you want to update cache immediately when files are created/modified via UI:

**Example: Update `src/actions/test-suite/test-suite-actions.ts`**

```typescript
import { updateCacheEntry, getFileMtime, calculateFileHash } from '@/lib/sync/cache-manager'
import { generateFeatureFile } from '@/lib/feature-file-generator'

// After generating feature file:
const featurePath = await generateFeatureFile(...)
const mtime = await getFileMtime(featurePath)
const hash = await calculateFileHash(featurePath)
const relativePath = relative(join(process.cwd(), 'src', 'tests'), featurePath)
await updateCacheEntry(relativePath, mtime, hash)
```

**Note**: This is optional - cache will be updated on next sync anyway.

---

## Key Benefits

✅ **Simple**: ~800 lines of code vs 2000+ for metadata approach  
✅ **Reliable**: Always accurate - no metadata drift  
✅ **Fast**: 0.4s typical, 1.2s worst case  
✅ **No Merge Conflicts**: Cache is gitignored  
✅ **Maintainable**: Easy to understand and debug  
✅ **Flexible**: Can force full sync when needed

---

## Implementation Order

1. **Phase 1**: Core infrastructure (cache manager, hash utils, file scanner)
2. **Phase 2**: Sync handlers (one per entity type)
3. **Phase 3**: Sync orchestrator
4. **Phase 4**: CLI scripts and git hooks
5. **Phase 5**: Optional integrations

---

## Migration from Existing System

If you have existing bidirectional sync code:

1. Run one final bidirectional sync
2. Generate initial cache (scan all files)
3. Start using new sync system
4. Old sync can coexist until migration complete

---

## Usage Flow

1. **Developer pulls changes**: Git merge happens
2. **Post-merge hook** (optional): Runs `npm run sync-entities`
3. **Sync process**:
   - Scans all files (fast - just stat() calls)
   - Checks cache for changes
   - Only processes changed files (typically 3-5)
   - Updates database
   - Updates cache
4. **Manual sync**: User runs `npm run sync-entities` anytime
5. **Force full sync**: `npm run sync-entities --full` to resync everything

---

## Error Handling

- **File parse errors**: Logged, skipped, sync continues
- **Database errors**: Logged, specific file skipped
- **Cache errors**: Non-fatal, cache regenerated on next sync
- **Missing files**: Orphaned cache entries cleaned up automatically

---

## Future Optimizations (If Needed)

1. **Parallel file reading**: Read multiple files concurrently
2. **Batch database operations**: Group multiple creates/updates
3. **Smart indexing**: Cache DB queries for common lookups
4. **Incremental parsing**: Only parse changed parts of files

These optimizations can be added later if performance becomes an issue, but likely not needed for your scale.
