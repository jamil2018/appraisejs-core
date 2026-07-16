const LOOPBACK_HOST = '127.0.0.1'

function hostOption(args) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '-H' || value === '--hostname') return args[index + 1]
    if (value.startsWith('--hostname=')) return value.slice('--hostname='.length)
  }
  return undefined
}

export function assertLoopbackHost(host, source = 'host configuration') {
  if (!host || host === LOOPBACK_HOST) return LOOPBACK_HOST
  throw new Error(
    `Appraise 0.5 is local-only. ${source} must be ${LOOPBACK_HOST}; received "${host}". Remote exposure is unsupported.`,
  )
}

/**
 * @param {string} mode
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 */
export function resolveLocalNextArgs(mode, args, env = process.env) {
  if (!['dev', 'start'].includes(mode)) throw new Error(`Unsupported local startup mode "${mode}".`)
  assertLoopbackHost(env.HOST, 'HOST')
  const configuredHost = hostOption(args)
  assertLoopbackHost(configuredHost, 'Next.js hostname')
  return [mode, ...(configuredHost ? args : ['-H', LOOPBACK_HOST, ...args])]
}
