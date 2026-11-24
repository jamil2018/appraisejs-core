import type { WorkspaceRequest } from './workspace-request'

export const codexLookupModel = 'gpt-6.1-sol'
export const codexLookupTool = 'workspace_record_search'
export const codexLookupNamespace = 'appraise'
export const codexLookupAcknowledgement = 'Appraise completed the lookup. Matching records stay in Appraise.'
export const codexLookupParameters = { type: 'object', properties: {}, additionalProperties: false, required: [] }

export function codexLookupPrompt(request: WorkspaceRequest) {
  return `Call appraise.workspace_record_search once with {} for this saved workspace lookup: ${JSON.stringify(request)}`
}
