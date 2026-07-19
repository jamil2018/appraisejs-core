import { describe, expect, it } from 'vitest'

import { BrowserRuntimeDiagnostics } from './browser-runtime-diagnostics'

describe('browser runtime diagnostics', () => {
  it('separates console/page failures from network failures and clears between scenarios', () => {
    const current = new BrowserRuntimeDiagnostics()
    current.record({ source: 'console', message: 'console failure' })
    current.record({ source: 'page', message: 'uncaught failure' })
    current.record({ source: 'network', message: 'HTTP 500', url: 'http://localhost/api' })

    expect(current.read('console-and-page')).toEqual([
      { source: 'console', message: 'console failure' },
      { source: 'page', message: 'uncaught failure' },
    ])
    expect(current.read('network')).toEqual([{ source: 'network', message: 'HTTP 500', url: 'http://localhost/api' }])

    current.clear()
    expect(current.readAll()).toEqual([])
  })
})
