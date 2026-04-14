import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { runPrompts } from './prompts.js'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  checkbox: vi.fn(),
}))

async function getMocks() {
  const { checkbox, input, select, confirm } = await import('@inquirer/prompts')
  return {
    checkbox: checkbox as ReturnType<typeof vi.fn>,
    input: input as ReturnType<typeof vi.fn>,
    select: select as ReturnType<typeof vi.fn>,
    confirm: confirm as ReturnType<typeof vi.fn>,
  }
}

describe('runPrompts', () => {
  let cwd: string
  let tempDir: string

  beforeEach(() => {
    cwd = process.cwd()
    tempDir = path.join(os.tmpdir(), `create-appraisejs-prompts-${Date.now()}`)
  })

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  it('returns directory, template, packageManager, runInstall, and browsers from mocked prompts', async () => {
    fs.mkdirSync(tempDir, { recursive: true })
    const { checkbox, input, select, confirm } = await getMocks()
    input.mockResolvedValue(tempDir)
    select.mockResolvedValueOnce('blank').mockResolvedValueOnce('pnpm')
    confirm.mockResolvedValue(true)
    checkbox.mockResolvedValue(['chromium', 'webkit'])

    const result = await runPrompts(cwd)

    expect(result.directory).toBe(path.resolve(cwd, tempDir))
    expect(result.template).toBe('blank')
    expect(result.packageManager).toBe('pnpm')
    expect(result.runInstall).toBe(true)
    expect(result.playwrightBrowsers).toEqual(['chromium', 'webkit'])
  })

  it('throws when target directory exists and is non-empty', async () => {
    fs.mkdirSync(tempDir, { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'x')
    const { input } = await getMocks()
    input.mockResolvedValue(tempDir)

    await expect(runPrompts(cwd)).rejects.toThrow(/Directory must be empty/)
  })

  it('defaults template selection to starter', async () => {
    const newPath = path.join(tempDir, 'new-app')
    const { checkbox, input, select, confirm } = await getMocks()
    input.mockResolvedValue(newPath)
    select.mockResolvedValueOnce('starter').mockResolvedValueOnce('npm')
    confirm.mockResolvedValue(true)
    checkbox.mockResolvedValue([])

    const result = await runPrompts(cwd)

    expect(result.directory).toBe(path.resolve(cwd, newPath))
    expect(result.template).toBe('starter')
    expect(result.packageManager).toBe('npm')
    expect(result.runInstall).toBe(true)
    expect(result.playwrightBrowsers).toEqual([])
    expect(select).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Which template do you want to start with?',
        default: 'starter',
      }),
    )
  })

  it('uses the supplied template option without prompting for template selection', async () => {
    const newPath = path.join(tempDir, 'new-app')
    const { checkbox, input, select, confirm } = await getMocks()
    input.mockResolvedValue(newPath)
    select.mockResolvedValue('yarn')
    confirm.mockResolvedValue(false)
    checkbox.mockResolvedValue([])

    const result = await runPrompts(cwd, { template: 'blank' })

    expect(result.directory).toBe(path.resolve(cwd, newPath))
    expect(result.template).toBe('blank')
    expect(result.packageManager).toBe('yarn')
    expect(result.runInstall).toBe(false)
    expect(result.playwrightBrowsers).toEqual([])
    expect(select).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Which package manager do you want to use?',
      }),
    )
  })
})
