import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getConfig } from './config.js'

describe('getConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CREATE_APPRAISE_REPO_URL
    delete process.env.CREATE_APPRAISE_BRANCH
    delete process.env.CREATE_APPRAISE_TEMPLATE_SUBPATH
    delete process.env.CREATE_APPRAISE_USE_BUNDLED
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns default repo base, branch, template subpath, and useBundled true when no env set', () => {
    const config = getConfig('starter')
    expect(config.repoBase).toContain('github.com')
    expect(config.repoBase).toContain('appraisejs')
    expect(config.branch).toBe('main')
    expect(config.templateSubpath).toBe('templates/starter')
    expect(config.useBundled).toBe(true)
  })

  it('maps blank to templates/blank when no subpath override is set', () => {
    const config = getConfig('blank')
    expect(config.templateSubpath).toBe('templates/blank')
    expect(config.useBundled).toBe(true)
  })

  it('uses CREATE_APPRAISE_REPO_URL when set', () => {
    process.env.CREATE_APPRAISE_REPO_URL = 'https://example.com/repo'
    const config = getConfig('starter')
    expect(config.repoBase).toBe('https://example.com/repo')
    expect(config.useBundled).toBe(false)
  })

  it('normalizes repo base: trims, removes trailing slash and .git', () => {
    process.env.CREATE_APPRAISE_REPO_URL = '  https://example.com/repo/.git/  '
    const config = getConfig('starter')
    expect(config.repoBase).toBe('https://example.com/repo')
  })

  it('uses CREATE_APPRAISE_BRANCH when set', () => {
    process.env.CREATE_APPRAISE_BRANCH = 'dev'
    const config = getConfig('starter')
    expect(config.branch).toBe('dev')
    expect(config.useBundled).toBe(false)
  })

  it('uses CREATE_APPRAISE_TEMPLATE_SUBPATH when set', () => {
    process.env.CREATE_APPRAISE_TEMPLATE_SUBPATH = 'templates/custom'
    const config = getConfig('blank')
    expect(config.templateSubpath).toBe('templates/custom')
    expect(config.useBundled).toBe(false)
  })

  it('sets useBundled true when CREATE_APPRAISE_USE_BUNDLED is 1', () => {
    process.env.CREATE_APPRAISE_REPO_URL = 'https://example.com/repo'
    process.env.CREATE_APPRAISE_USE_BUNDLED = '1'
    const config = getConfig('starter')
    expect(config.useBundled).toBe(true)
  })

  it('sets useBundled true when CREATE_APPRAISE_USE_BUNDLED is true', () => {
    process.env.CREATE_APPRAISE_USE_BUNDLED = 'true'
    const config = getConfig('starter')
    expect(config.useBundled).toBe(true)
  })

  it('sets useBundled true when CREATE_APPRAISE_USE_BUNDLED is yes', () => {
    process.env.CREATE_APPRAISE_USE_BUNDLED = 'yes'
    const config = getConfig('starter')
    expect(config.useBundled).toBe(true)
  })

  it('keeps bundled mode when CREATE_APPRAISE_USE_BUNDLED is empty or 0 without remote override', () => {
    process.env.CREATE_APPRAISE_USE_BUNDLED = ''
    expect(getConfig('starter').useBundled).toBe(true)
    process.env.CREATE_APPRAISE_USE_BUNDLED = '0'
    expect(getConfig('starter').useBundled).toBe(true)
  })
})
