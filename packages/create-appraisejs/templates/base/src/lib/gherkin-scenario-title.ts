export function parseGherkinScenarioTitle(
  scenarioName: string,
  scenarioDescription?: string,
): { title: string; description: string } {
  if (scenarioDescription) {
    return {
      title: scenarioDescription.trim(),
      description: scenarioName.trim(),
    }
  }

  return { title: scenarioName.trim(), description: '' }
}
