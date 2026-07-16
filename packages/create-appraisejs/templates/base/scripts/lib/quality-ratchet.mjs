const suppressionPattern = /^(?:\/\/|\/\*)\s*(?:fallow-ignore|eslint-disable|@ts-ignore|@ts-expect-error)\b/

export function addedQualitySuppressions(patch) {
  return patch
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1).trim())
    .filter(line => suppressionPattern.test(line))
}
