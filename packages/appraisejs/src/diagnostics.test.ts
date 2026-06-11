import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'

const workspaces: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('CLI diagnostics', () => {
  it('reports Git, dirty artifact, identity, and application reachability warnings', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-doctor-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"doctor-test"}')
    await fs.mkdir(path.join(cwd, 'appraise', 'plans'), { recursive: true })
    await fs.writeFile(path.join(cwd, 'appraise', 'plans', 'draft.yaml'), 'version: "1"\n')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const result = await diagnoseProject({ cwd, baseUrl: 'http://127.0.0.1:9' })

    expect(result.ok).toBe(false)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'git', status: 'warning' }),
        expect.objectContaining({ id: 'application', status: 'error' }),
      ]),
    )
  })

  it('gives explicit recovery without claiming silent CLI fallback', () => {
    expect(formatMcpBootstrapError(new Error('boom'))).toContain('No CLI fallback was attempted')
    expect(formatMcpBootstrapError(new Error('boom'))).toContain('appraisejs doctor')
  })
})
