type BindingOptions<Cli, Failed> = {
  resolveCli: () => Promise<Cli | undefined>
  identify: (cli: Cli, signal?: AbortSignal) => Promise<string | undefined>
  current: () => boolean
  active: (delta: 1 | -1) => void
  unavailable: () => Error
  failed: Failed
}

export async function bindVerifiedNativeLookup<Cli, Result, Failed>(
  options: BindingOptions<Cli, Failed>,
): Promise<(run: (cli: Cli) => Promise<Result>, signal: AbortSignal) => Promise<Result | Failed>> {
  if (!options.current()) throw options.unavailable()
  const cli = await options.resolveCli()
  const identity = await (cli && options.identify(cli).catch(() => undefined))
  if (!cli || !identity || !options.current()) throw options.unavailable()

  return async (run, signal) => {
    if (!options.current() || signal.aborted) return options.failed
    options.active(1)
    try {
      const currentIdentity = await options.identify(cli, signal).catch(() => undefined)
      if (identity !== currentIdentity) return options.failed
      signal.throwIfAborted()
      return await run(cli)
    } finally {
      options.active(-1)
    }
  }
}
