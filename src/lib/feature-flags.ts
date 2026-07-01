const truthyFeatureValues = new Set(['1', 'true', 'yes', 'on'])

function isFeatureEnabled(value: string | null | undefined): boolean {
  return truthyFeatureValues.has(value?.trim().toLowerCase() ?? '')
}

export function isProviderNativeRunsEnabled(): boolean {
  return isFeatureEnabled(
    process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS ?? process.env.NEXT_PUBLIC_APPRAISE_EXPERIMENTAL_PROVIDER_RUNS,
  )
}
