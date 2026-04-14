export function mergeMissingLocators(
  baseLocators: Record<string, string>,
  locatorsToEnsure: Record<string, string>,
): { mergedLocators: Record<string, string>; addedCount: number } {
  const mergedLocators: Record<string, string> = { ...baseLocators }
  let addedCount = 0

  for (const [locatorName, locatorValue] of Object.entries(locatorsToEnsure)) {
    if (locatorName in mergedLocators) {
      continue
    }

    mergedLocators[locatorName] = locatorValue
    addedCount++
  }

  return {
    mergedLocators,
    addedCount,
  }
}
