import type winston from 'winston'

import { closeLogger } from './winston-logger'

type LoggerSink = Pick<winston.Logger, 'info' | 'error'>

export class TestRunLogger {
  private state: 'open' | 'closing' | 'closed' = 'open'
  private closePromise: Promise<void> | undefined

  constructor(
    private readonly sink: LoggerSink,
    private readonly closeSink: () => Promise<void> = () => closeLogger(sink as winston.Logger),
  ) {}

  info(message: string): boolean {
    return this.write('info', message)
  }

  error(message: string): boolean {
    return this.write('error', message)
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.state = 'closing'
    this.closePromise = this.closeSink().finally(() => {
      this.state = 'closed'
    })
    return this.closePromise
  }

  isClosed(): boolean {
    return this.state === 'closed'
  }

  private write(level: 'info' | 'error', message: string): boolean {
    if (this.state !== 'open') return false
    this.sink[level](message)
    return true
  }
}
