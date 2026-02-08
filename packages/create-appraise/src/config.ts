const DEFAULT_REPO_BASE = 'https://github.com/jamil2018/appraise';
const DEFAULT_BRANCH = 'main';
const DEFAULT_TEMPLATE_SUBPATH = 'templates/default';

export interface Config {
  repoBase: string;
  branch: string;
  templateSubpath: string;
  useBundled: boolean;
}

function normalizeRepoBase(value: string): string {
  let s = value.trim();
  while (s.endsWith('/') || s.endsWith('.git')) {
    if (s.endsWith('.git')) s = s.slice(0, -4);
    else if (s.endsWith('/')) s = s.slice(0, -1);
  }
  return s;
}

export function getConfig(): Config {
  const repoBaseRaw = process.env.CREATE_APPRAISE_REPO_URL ?? DEFAULT_REPO_BASE;
  const repoBase = repoBaseRaw ? normalizeRepoBase(repoBaseRaw) : DEFAULT_REPO_BASE;

  const branch = process.env.CREATE_APPRAISE_BRANCH?.trim() ?? DEFAULT_BRANCH;

  const templateSubpath =
    process.env.CREATE_APPRAISE_TEMPLATE_SUBPATH?.trim() ?? DEFAULT_TEMPLATE_SUBPATH;

  const useBundledRaw = process.env.CREATE_APPRAISE_USE_BUNDLED;
  const useBundled =
    useBundledRaw !== undefined &&
    useBundledRaw !== '' &&
    ['1', 'true', 'yes'].includes(String(useBundledRaw).toLowerCase());

  return {
    repoBase: repoBase || DEFAULT_REPO_BASE,
    branch,
    templateSubpath,
    useBundled,
  };
}
