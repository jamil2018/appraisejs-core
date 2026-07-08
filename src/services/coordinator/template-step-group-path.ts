function sanitizeTemplateStepGroupName(groupName: string) {
  return groupName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function templateStepGroupPath(groupName: string, type: string | null | undefined) {
  const fileName = sanitizeTemplateStepGroupName(groupName)
  const subdirectory = type === 'ACTION' ? 'actions' : 'validations'
  return `automation/steps/${subdirectory}/${fileName}.step.ts`
}
