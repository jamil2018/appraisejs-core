import { DEFAULT_TEMPLATE_ID, resolveRemoteTemplateSubpath, type TemplateId } from './template-catalog.js'

const DEFAULT_REPO_BASE = 'https://github.com/jamil2018/appraisejs-core.git'
const DEFAULT_BRANCH = 'main'

export interface Config {
  repoBase: string
  branch: string
  templateSubpath: string
  useBundled: boolean
}

function normalizeRepoBase(value: string): string {
  let s = value.trim()
  while (s.endsWith('/') || s.endsWith('.git')) {
    if (s.endsWith('.git')) s = s.slice(0, -4)
    else if (s.endsWith('/')) s = s.slice(0, -1)
  }
  return s
}

export function getConfig(template: TemplateId = DEFAULT_TEMPLATE_ID): Config {
  const hasRemoteOverride =
    Boolean(process.env.CREATE_APPRAISE_REPO_URL?.trim()) ||
    Boolean(process.env.CREATE_APPRAISE_BRANCH?.trim()) ||
    Boolean(process.env.CREATE_APPRAISE_TEMPLATE_SUBPATH?.trim())

  const repoBaseRaw = process.env.CREATE_APPRAISE_REPO_URL ?? DEFAULT_REPO_BASE
  const repoBase = repoBaseRaw ? normalizeRepoBase(repoBaseRaw) : DEFAULT_REPO_BASE

  const branch = process.env.CREATE_APPRAISE_BRANCH?.trim() ?? DEFAULT_BRANCH

  const templateSubpath = process.env.CREATE_APPRAISE_TEMPLATE_SUBPATH?.trim() ?? resolveRemoteTemplateSubpath(template)

  const useBundledRaw = process.env.CREATE_APPRAISE_USE_BUNDLED
  const forceBundled =
    useBundledRaw !== undefined &&
    useBundledRaw !== '' &&
    ['1', 'true', 'yes'].includes(String(useBundledRaw).toLowerCase())
  const useBundled = forceBundled || !hasRemoteOverride

  return {
    repoBase: repoBase || DEFAULT_REPO_BASE,
    branch,
    templateSubpath,
    useBundled,
  }
}
