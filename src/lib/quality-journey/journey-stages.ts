export const journeyStages = ['Requirements', 'Scenarios', 'Test run', 'Results'] as const

export function journeyStageName(stage: string): (typeof journeyStages)[number] {
  switch (stage) {
    case 'DISCOVERY':
    case 'SCENARIO_DESIGN':
    case 'SCENARIO_REVIEW':
      return 'Scenarios'
    case 'AUTOMATION':
    case 'EXECUTION':
      return 'Test run'
    case 'TRIAGE':
    case 'REPORT_REVIEW':
    case 'CLOSED':
      return 'Results'
    default:
      return 'Requirements'
  }
}
