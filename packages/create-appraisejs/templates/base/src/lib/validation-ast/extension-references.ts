import type { ValidationAst } from './schemas'

export function validationAstExtensionReferences(ast: ValidationAst) {
  return ast.scenarios.flatMap(scenario =>
    scenario.steps.flatMap(step =>
      Object.values(step.action.inputs).filter(
        (value): value is { ref: 'custom-extension'; id: string; version: string } =>
          Boolean(value && typeof value === 'object' && 'ref' in value && value.ref === 'custom-extension'),
      ),
    ),
  )
}
