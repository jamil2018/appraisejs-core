import { constants } from 'node:fs'
import { mkdir, open, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

/** Original caller credential survives a pre-send retry; no attempt/session credential is exposed to the browser. */
export async function appManagedAnalysisCredential(binding: object, client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
  const database = rows.find(row => row.name === 'main')?.file
  if (!database || !path.isAbsolute(database))
    throw new ServiceError('Local Analysis requires a durable local database.', 'CONFLICT')
  const filename = await realpath(database)
  const physical = await lstat(filename)
  const root = path.join(path.dirname(filename), '.appraisejs-local-analysis')
  await mkdir(root, { mode: 0o700 }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  })
  const metadata = await lstat(root)
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    metadata.uid !== process.getuid?.() ||
    (metadata.mode & 0o777) !== 0o700
  )
    throw new ServiceError('The local Analysis credential store is not private.', 'CONFLICT')
  const keyPath = path.join(root, 'owner.key')
  try {
    const fresh = await open(
      keyPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await fresh.writeFile(randomBytes(32))
      await fresh.sync()
    } finally {
      await fresh.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const handle = await open(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== metadata.uid ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size !== 32
    )
      throw new ServiceError('The local Analysis owner credential is unavailable.', 'CONFLICT')
    const key = await handle.readFile()
    return createHmac('sha256', key)
      .update(
        canonicalContractJson({
          schema: 'appraise.local-analysis-credential/v1',
          database: { filename, device: physical.dev, inode: physical.ino },
          binding,
        }),
      )
      .digest('hex')
  } finally {
    await handle.close()
  }
}
