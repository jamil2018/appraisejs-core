/** In-memory classification of metadata already requested by the unchanged observer. */
import { basename } from 'node:path'

const PACKAGE = '/Applications/ChatGPT.app/Contents/Resources/codex-cli'
export const CHILD_PATH_CLASSES = Object.freeze([
  'EXPECTED_HOST',
  'MANIFEST_INTERPRETER',
  'MANIFEST_CODEX',
  'PACKAGE_RESOURCE_HOST',
  'PACKAGE_BIN_CODEX',
  'CODEX_PACKAGE_OTHER',
  'SYSTEM_CAFFEINATE',
  'SYSTEM_BIN',
  'HOMEBREW',
  'PRIVATE_TMP',
  'OTHER',
  'UNAVAILABLE',
])
const NAMES = Object.freeze({
  'codex-code-mode-host': 'CODE_MODE_HOST',
  codex: 'CODEX',
  node: 'NODE',
  git: 'GIT',
  caffeinate: 'CAFFEINATE',
  launchctl: 'LAUNCHCTL',
  open: 'OPEN',
  sysctl: 'SYSCTL',
  ioreg: 'IOREG',
  'sandbox-exec': 'SANDBOX_EXEC',
  sh: 'SH',
  bash: 'BASH',
  zsh: 'ZSH',
  rg: 'RIPGREP',
  uname: 'UNAME',
  env: 'ENV',
  pwd: 'PWD',
  ps: 'PS',
  ls: 'LS',
  uv: 'UV',
  python3: 'PYTHON3',
  'codex-execve-wrapper': 'CODEX_EXECVE_WRAPPER',
  'codex-exec-server': 'CODEX_EXEC_SERVER',
})
const pathClasses = new Set(CHILD_PATH_CLASSES)
const nameClasses = new Set([...Object.values(NAMES), 'OTHER', 'UNAVAILABLE'])
const entryKeys = ['pathClass', 'basenameClass', 'expectedHostMatch', 'interpreterMatch', 'codexMatch']

function classify(path, { expectedHostPath, interpreterPath, codexPath }) {
  if (typeof path !== 'string')
    return {
      pathClass: 'UNAVAILABLE',
      basenameClass: 'UNAVAILABLE',
      expectedHostMatch: false,
      interpreterMatch: false,
      codexMatch: false,
    }
  const expectedHostMatch = path === expectedHostPath
  const interpreterMatch = path === interpreterPath
  const codexMatch = path === codexPath
  let pathClass = 'OTHER'
  if (expectedHostMatch) pathClass = 'EXPECTED_HOST'
  else if (interpreterMatch) pathClass = 'MANIFEST_INTERPRETER'
  else if (codexMatch) pathClass = 'MANIFEST_CODEX'
  else if (path === `${PACKAGE}/codex-resources/codex-code-mode-host`) pathClass = 'PACKAGE_RESOURCE_HOST'
  else if (path === `${PACKAGE}/bin/codex`) pathClass = 'PACKAGE_BIN_CODEX'
  else if (path.startsWith(`${PACKAGE}/`)) pathClass = 'CODEX_PACKAGE_OTHER'
  else if (path === '/usr/bin/caffeinate') pathClass = 'SYSTEM_CAFFEINATE'
  else if (path.startsWith('/usr/bin/') || path.startsWith('/bin/')) pathClass = 'SYSTEM_BIN'
  else if (path.startsWith('/opt/homebrew/')) pathClass = 'HOMEBREW'
  else if (path.startsWith('/private/tmp/')) pathClass = 'PRIVATE_TMP'
  return {
    pathClass,
    basenameClass: Object.hasOwn(NAMES, basename(path)) ? NAMES[basename(path)] : 'OTHER',
    expectedHostMatch,
    interpreterMatch,
    codexMatch,
  }
}

/** No raw path, PID, birth identity, command, environment, or hash of raw path is retained. */
export function createChildPathDiagnostics(os, paths) {
  if (
    !os ||
    ['identity', 'listDirectChildren', 'directChildMetadata'].some(k => typeof os[k] !== 'function') ||
    ['expectedHostPath', 'interpreterPath', 'codexPath'].some(k => typeof paths?.[k] !== 'string')
  )
    throw new Error('child path diagnostic ports invalid')
  const observations = []
  let overflow = false
  let unavailable = false
  const ports = Object.freeze({
    identity: (...args) => os.identity(...args),
    listDirectChildren: (...args) => os.listDirectChildren(...args),
    directChildMetadata: (...args) => {
      const metadata = os.directChildMetadata(...args)
      if (metadata !== null) {
        try {
          if (observations.length < 15) observations.push(Object.freeze(classify(metadata.path, paths)))
          else overflow = true
        } catch {
          unavailable = true
        }
      }
      return metadata
    },
  })
  return Object.freeze({
    ports,
    snapshot: () =>
      Object.freeze({
        observations: observations.map(x => ({ ...x })),
        overflow,
        unavailable,
        additionalOsQueries: 0,
        rawPathRetained: false,
      }),
  })
}

export function validateChildPathDiagnostics(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      ['observations', 'overflow', 'unavailable', 'additionalOsQueries', 'rawPathRetained'].sort().join(',') ||
    !Array.isArray(value.observations) ||
    value.observations.length > 15 ||
    typeof value.overflow !== 'boolean' ||
    typeof value.unavailable !== 'boolean' ||
    value.additionalOsQueries !== 0 ||
    value.rawPathRetained !== false
  )
    throw new Error('child path diagnostic contract')
  for (const item of value.observations) {
    if (
      !item ||
      Object.keys(item).sort().join(',') !== [...entryKeys].sort().join(',') ||
      !pathClasses.has(item.pathClass) ||
      !nameClasses.has(item.basenameClass) ||
      ['expectedHostMatch', 'interpreterMatch', 'codexMatch'].some(k => typeof item[k] !== 'boolean')
    )
      throw new Error('child path diagnostic entry contract')
  }
  return value
}
