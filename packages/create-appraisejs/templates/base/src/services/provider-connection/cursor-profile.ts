import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { Socket } from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'

import { cursorImageCommand, cursorProfileUnavailable, ensureCursorImageAvailable } from './cursor-disk-image'
import { acquireCursorProfileLock } from './cursor-profile-lock'
import { providerSecretVault } from './provider-secret-vault'

const imageName = 'cursor.sparseimage'
const keyName = 'vault-id'

export async function cursorPrivateDirectory(directory: string) {
  await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
    throw cursorProfileUnavailable()
  return directory
}

async function privateFile(filename: string, maxBytes: number) {
  const info = await lstat(filename)
  if (
    !info.isFile() ||
    info.uid !== process.getuid?.() ||
    info.nlink !== 1 ||
    (info.mode & 0o077) !== 0 ||
    info.size < 1 ||
    info.size > maxBytes
  ) {
    throw cursorProfileUnavailable()
  }
  return filename
}

async function initializeImage(storage: string, directory: string) {
  const staging = await mkdtemp(path.join(storage, '.profile-'))
  const id = randomUUID()
  const secret = randomBytes(32)
  let keyCreated = false
  let published = false
  try {
    await providerSecretVault.create(id, secret)
    keyCreated = true
    const image = path.join(staging, imageName)
    await cursorImageCommand(
      [
        'create',
        '-size',
        '128m',
        '-fs',
        'APFS',
        '-type',
        'SPARSE',
        '-volname',
        'Appraise Cursor',
        '-encryption',
        'AES-256',
        '-stdinpass',
        image,
      ],
      secret,
    )
    await chmod(image, 0o600)
    await writeFile(path.join(staging, keyName), id, { mode: 0o600, flag: 'wx', flush: true })
    try {
      await rename(staging, directory)
      published = true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error
    }
  } finally {
    secret.fill(0)
    if (!published) {
      await rm(staging, { recursive: true, force: true })
      if (keyCreated) await providerSecretVault.remove(id)
    }
  }
}

// A detached watcher sees EOF if the Appraise process exits while the
// image is mounted. It never receives the passphrase or provider data.
async function watchMount(root: string, volume: string, originalDevice: number) {
  const watcher = spawn(
    '/bin/sh',
    [
      '-c',
      `IFS= read -r released && [ "$released" = detached ] && exit 0
      attempt=0
      while [ -d "$1" ]; do
        if /usr/bin/hdiutil detach "$1" >/dev/null 2>&1; then
          /bin/rmdir "$1" "$2" 2>/dev/null
          exit 0
        fi
        if [ "$attempt" -lt 30 ]; then
          attempt=$((attempt+1))
          /bin/sleep 1
        elif [ "$(/usr/bin/stat -f %d "$1" 2>/dev/null)" = "$3" ]; then
          /bin/rmdir "$1" "$2" 2>/dev/null
          exit 0
        else
          /bin/sleep 5
        fi
      done`,
      'appraise-cursor-volume',
      volume,
      root,
      String(originalDevice),
    ],
    {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin' },
    },
  )
  watcher.stdin.on('error', () => undefined)
  await new Promise<void>((resolve, reject) => {
    watcher.once('spawn', resolve)
    watcher.once('error', reject)
  })
  if (watcher.stdin instanceof Socket) watcher.stdin.unref()
  watcher.unref()
  return watcher.stdin
}

async function profileImage(storage: string) {
  const directory = path.join(storage, 'encrypted-profile')
  try {
    await lstat(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await initializeImage(storage, directory)
  }
  await cursorPrivateDirectory(directory)
  const image = await privateFile(path.join(directory, imageName), 256 * 1024 * 1024)
  const id = await readFile(await privateFile(path.join(directory, keyName), 36), 'utf8')
  return { image, id }
}

async function openProfile() {
  const storage = await cursorPrivateDirectory(path.join(await realpath(homedir()), '.appraise-cursor'))
  const lock = await acquireCursorProfileLock(storage)
  try {
    const mounted = await mountProfile(storage, lock.assertHeld)
    return {
      profile: mounted.profile,
      async close() {
        try {
          await mounted.close()
        } finally {
          await lock.release()
        }
      },
    }
  } catch (error) {
    await lock.release()
    throw error
  }
}

async function mountProfile(storage: string, assertLease: () => void) {
  const { image, id } = await profileImage(storage)
  await ensureCursorImageAvailable(image, assertLease)
  const secret = await providerSecretVault.read(id)
  if (!secret) throw cursorProfileUnavailable()

  let mountRoot: string | undefined
  let mounted: string | undefined
  let mountDevice: number | undefined
  let watcher: Awaited<ReturnType<typeof watchMount>> | undefined
  try {
    mountRoot = await mkdtemp(path.join(await realpath('/tmp'), 'appraise-cursor-volume-'))
    mounted = await cursorPrivateDirectory(path.join(mountRoot, 'volume'))
    mountDevice = (await lstat(mounted)).dev
    watcher = await watchMount(mountRoot, mounted, mountDevice)
    assertLease()
    await cursorImageCommand(
      ['attach', '-nobrowse', '-noautoopen', '-owners', 'on', '-stdinpass', '-mountpoint', mounted, image],
      secret,
    )
    if (mountDevice === (await lstat(mounted)).dev) throw cursorProfileUnavailable()
    const root = mountRoot
    const volume = mounted
    const device = mountDevice
    const profile = await cursorPrivateDirectory(path.join(volume, 'home'))
    const cleanupWatcher = watcher
    return {
      profile,
      async close() {
        try {
          assertLease()
          await closeProfile(root, volume, device)
          await ensureCursorImageAvailable(image, assertLease)
          cleanupWatcher.end('detached\n')
        } finally {
          cleanupWatcher.end()
        }
      },
    }
  } catch (error) {
    try {
      if (mountRoot && mounted && mountDevice !== undefined) await closeProfile(mountRoot, mounted, mountDevice)
      watcher?.end('detached\n')
    } finally {
      watcher?.end()
    }
    throw error
  } finally {
    secret.fill(0)
  }
}

async function closeProfile(root: string, volume: string, originalDevice: number) {
  if ((await lstat(volume)).dev !== originalDevice) await cursorImageCommand(['detach', volume])
  await rmdir(volume)
  await rmdir(root)
}

type OpenProfile = Awaited<ReturnType<typeof openProfile>>
type ProfileLease = { users: number; profile: Promise<OpenProfile>; closed?: Promise<void> }
const processState = globalThis as typeof globalThis & { appraiseCursorProfile?: ProfileLease }

export async function withEncryptedCursorProfile<T>(run: (profile: string) => Promise<T>) {
  while (processState.appraiseCursorProfile?.closed) await processState.appraiseCursorProfile.closed
  const lease = (processState.appraiseCursorProfile ??= { users: 0, profile: openProfile() })
  lease.users += 1
  try {
    return await run((await lease.profile).profile)
  } finally {
    lease.users -= 1
    if (lease.users === 0) {
      lease.closed = lease.profile
        .then(
          profile => profile.close(),
          () => undefined,
        )
        .finally(() => {
          if (processState.appraiseCursorProfile === lease) delete processState.appraiseCursorProfile
        })
      await lease.closed
    }
  }
}
