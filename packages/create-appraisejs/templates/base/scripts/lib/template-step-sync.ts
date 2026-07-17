export type TemplateStepReferenceCounter = {
  testCaseStep: { count(input: { where: { templateStepId: string } }): Promise<number> }
  templateTestCaseStep: { count(input: { where: { templateStepId: string } }): Promise<number> }
}

export async function hasTemplateStepReferences(
  client: TemplateStepReferenceCounter,
  templateStepId: string,
): Promise<boolean> {
  const [testCaseReferences, templateCaseReferences] = await Promise.all([
    client.testCaseStep.count({ where: { templateStepId } }),
    client.templateTestCaseStep.count({ where: { templateStepId } }),
  ])
  return testCaseReferences + templateCaseReferences > 0
}
