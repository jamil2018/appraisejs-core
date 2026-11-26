import { execFile } from 'node:child_process'
import { z } from 'zod'

export function cursorProfileUnavailable() {
  return new Error('Cursor’s encrypted profile could not be opened.')
}

function diskTool(executable: string, args: string[], input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      executable,
      args,
      {
        env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin:/usr/sbin', LC_ALL: 'C' },
        encoding: 'utf8',
        timeout: 30_000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) resolve(stdout)
        else if (
          executable === '/usr/bin/hdiutil' &&
          args[0] === 'isencrypted' &&
          typeof error.code === 'number' &&
          /^hdiutil: isencrypted failed - Resource temporarily unavailable\s*$/m.test(stderr)
        ) {
          reject(new BusyCursorImageError())
        } else {
          reject(cursorProfileUnavailable())
        }
      },
    )
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(input)
  })
}

class BusyCursorImageError extends Error {}

export function cursorImageCommand(args: string[], secret?: Buffer) {
  return diskTool('/usr/bin/hdiutil', args, secret && `${secret.toString('hex')}\0`)
}

const diskImageList = z.object({
  images: z.array(
    z
      .object({
        'image-path': z.string(),
        'system-entities': z.array(z.object({ 'dev-entry': z.string() }).passthrough()),
      })
      .passthrough(),
  ),
})
const attachment = z.object({
  'owner-uid': z.number(),
  'image-encrypted': z.literal(true),
  'hdid-pid': z.number().optional(),
  'system-entities': z.array(
    z.object({
      'dev-entry': z.string(),
      'content-hint': z.string().optional(),
      'mount-point': z.never().optional(),
    }),
  ),
})

async function unmountedImageDevice(image: string) {
  const plist = await cursorImageCommand(['info', '-plist'])
  const json = await diskTool('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], plist)
  const { images } = diskImageList.parse(JSON.parse(json))
  const matches = images.filter(entry => entry['image-path'] === image)
  if (matches.length === 0) return
  if (matches.length !== 1) throw cursorProfileUnavailable()

  const parsed = attachment.safeParse(matches[0])
  if (!parsed.success || parsed.data['owner-uid'] !== process.getuid?.()) throw cursorProfileUnavailable()
  const wholeDisks = parsed.data['system-entities'].filter(
    entity => entity['content-hint'] === 'GUID_partition_scheme' && /^\/dev\/disk\d+$/.test(entity['dev-entry']),
  )
  if (wholeDisks.length !== 1) throw cursorProfileUnavailable()
  const device = wholeDisks[0]['dev-entry']
  const otherClaimant = images.some(
    entry =>
      entry !== matches[0] &&
      entry['system-entities'].some(
        entity => entity['dev-entry'] === device || entity['dev-entry'].startsWith(`${device}s`),
      ),
  )
  if (otherClaimant) throw cursorProfileUnavailable()
  return { device, driverPid: parsed.data['hdid-pid'] }
}

/** Recover only the known private encrypted image while the caller holds its profile lease. */
export async function ensureCursorImageAvailable(image: string, assertLease: () => void) {
  const check = () => cursorImageCommand(['isencrypted', image])
  let encryption: string
  assertLease()
  try {
    encryption = await check()
  } catch (error) {
    if (!(error instanceof BusyCursorImageError)) throw error
    const candidate = await unmountedImageDevice(image)
    if (candidate) {
      const confirmed = await unmountedImageDevice(image)
      if (confirmed?.device !== candidate.device || confirmed.driverPid !== candidate.driverPid) {
        throw cursorProfileUnavailable()
      }
      assertLease()
      await cursorImageCommand(['detach', candidate.device])
    }
    encryption = await check()
  }
  if (!/^encrypted: YES$/m.test(encryption)) throw cursorProfileUnavailable()
}
