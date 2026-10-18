/** Standalone host-permission check. This does not authorize a T2 retry. */
import { createHash } from 'node:crypto'

export const PREFLIGHT = Object.freeze({
  version: 'appraise.m02-ta-host-preflight-r14/v1',
  root: '/private/tmp/appraise-m02-ta-host-preflight-p1',
  node: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
  platform: 'darwin',
  arch: 'arm64',
  nodeVersion: '26.11.0',
  osBuild: '26A434',
  plist: '/System/Library/CoreServices/SystemVersion.plist',
  packageMarker: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json',
  packageMarkerSha256: '558c7aabb05ccc87bdb8c8514f87659fec72929a39919c7156f8b8889f7589b3',
  priorManifestSha256: '23a57757e47d07925a54a3bc7785f02495a56e26c6769476a2cda7bf75fb35a2',
  priorReviewSha256: '05a68bcbaaa6da09241d34f1800bad81f632b5c7ee13f52507c7fcc671fad028',
  priorArtifacts: 6413,
  listenerHost: '127.0.0.1',
  listenerPort: 0,
  listenerStarts: 1,
  directories: Object.freeze([
    '.',
    'cases',
    'cases/B01',
    'cases/B01/home',
    'cases/B01/codex',
    'cases/B01/workspace',
    'cases/B01/tmp',
    'cases/B01/supervisor',
  ]),
  directoryCreates: 8,
  deadlineMs: 10_000,
  syntheticBytes: 'APPRAISE_M02_R14_HOST_PREFLIGHT\n',
  controlFileWrites: 3,
  appraiseBootstrapWrites: 0,
  providerRequests: 0,
  mcpStarts: 0,
  codexStarts: 0,
  scope: 'HOST_FILE_AND_LOOPBACK_PERMISSION_ONLY',
})

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export const digest = value => sha256(JSON.stringify(value))

export function reviewedEnvironment(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return false
  const keys = Object.keys(env).sort()
  const cf = Object.hasOwn(env, '__CF_USER_TEXT_ENCODING')
  const expected = cf ? ['LANG', 'PATH', '__CF_USER_TEXT_ENCODING'].sort() : ['LANG', 'PATH']
  return (
    JSON.stringify(keys) === JSON.stringify(expected) &&
    env.PATH === '/usr/bin:/bin' &&
    env.LANG === 'C' &&
    (!cf || /^0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}$/.test(env.__CF_USER_TEXT_ENCODING))
  )
}

export function classify(error) {
  const allowed = new Set(['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'EIO', 'EADDRINUSE', 'EADDRNOTAVAIL', 'ETIMEDOUT'])
  return allowed.has(error?.code) ? error.code : 'OTHER'
}
