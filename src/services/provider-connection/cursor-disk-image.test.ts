import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureCursorImageAvailable } from './cursor-disk-image'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

const image = '/private/tmp/appraise-fixture/encrypted-profile/cursor.sparseimage'
const otherImage = '/private/tmp/other-profile/encrypted-profile/cursor.sparseimage'
const owner = process.getuid?.()
const encrypted = { stdout: 'encrypted: YES\n' }
const busy = { stderr: 'hdiutil: isencrypted failed - Resource temporarily unavailable\n' }
const assertLease = () => {}

function attachment(path: string, disk: string, mountPoint?: string) {
  return {
    'image-path': path,
    'owner-uid': owner,
    'image-encrypted': true,
    'system-entities': [
      { 'dev-entry': disk, 'content-hint': 'GUID_partition_scheme' },
      { 'dev-entry': `${disk}s1`, ...(mountPoint && { 'mount-point': mountPoint }) },
    ],
  }
}

function reply({ stderr = '', stdout = '' }: { stderr?: string; stdout?: string } = {}) {
  execFile.mockImplementationOnce((_file, _args, _options, callback) => {
    queueMicrotask(() => callback(stderr ? Object.assign(new Error(), { code: 1 }) : null, stdout, stderr))
    return { stdin: new PassThrough() }
  })
}

function imageInfo(...images: unknown[]) {
  reply({ stdout: 'disk image property list' })
  reply({ stdout: JSON.stringify({ images }) })
}

function hdiutilCalls() {
  return execFile.mock.calls
    .filter(([executable]) => executable === '/usr/bin/hdiutil')
    .map(([, args]) => args as string[])
}

describe.skipIf(owner === undefined)('Cursor encrypted disk recovery', () => {
  beforeEach(() => execFile.mockReset())

  it('ejects only the matching encrypted whole disk and rechecks the image', async () => {
    reply(busy)
    imageInfo(attachment(otherImage, '/dev/disk6'), attachment(image, '/dev/disk4'))
    imageInfo(attachment(image, '/dev/disk4'), attachment(otherImage, '/dev/disk6'))
    reply()
    reply(encrypted)

    await ensureCursorImageAvailable(image, assertLease)

    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
      ['info', '-plist'],
      ['detach', '/dev/disk4'],
      ['isencrypted', image],
    ])
  })

  it.each([
    ['mounted', attachment(image, '/dev/disk4', '/private/tmp/active')],
    ['foreign owner', { ...attachment(image, '/dev/disk4'), 'owner-uid': -1 }],
    ['unencrypted', { ...attachment(image, '/dev/disk4'), 'image-encrypted': false }],
    ['invalid device', attachment(image, '/dev/disk4s1')],
  ])('refuses a target with %s metadata', async (_description, entry) => {
    reply(busy)
    imageInfo(entry)
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
    ])
  })

  it('refuses duplicate image records', async () => {
    reply(busy)
    imageInfo(attachment(image, '/dev/disk4'), attachment(image, '/dev/disk8'))
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
    ])
  })

  it('refuses when the device assignment changes before eject', async () => {
    reply(busy)
    imageInfo(attachment(image, '/dev/disk4'))
    imageInfo(attachment(image, '/dev/disk8'))
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
      ['info', '-plist'],
    ])
  })

  it('refuses a backing disk claimed by another image record', async () => {
    reply(busy)
    imageInfo(attachment(image, '/dev/disk4'), attachment(otherImage, '/dev/disk4'))
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
    ])
  })

  it('refuses when the disk image helper changes before eject', async () => {
    reply(busy)
    imageInfo({ ...attachment(image, '/dev/disk4'), 'hdid-pid': 101 })
    imageInfo({ ...attachment(image, '/dev/disk4'), 'hdid-pid': 102 })
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
      ['info', '-plist'],
    ])
  })

  it('leaves a matching filename in another directory alone', async () => {
    reply(busy)
    imageInfo(attachment(otherImage, '/dev/disk4'))
    reply(busy)
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([
      ['isencrypted', image],
      ['info', '-plist'],
      ['isencrypted', image],
    ])
  })

  it('does not attempt recovery when the encryption check fails for another reason', async () => {
    reply({ stderr: 'hdiutil: isencrypted failed - Permission denied\n' })
    await expect(ensureCursorImageAvailable(image, assertLease)).rejects.toThrow()
    expect(hdiutilCalls()).toEqual([['isencrypted', image]])
  })
})
