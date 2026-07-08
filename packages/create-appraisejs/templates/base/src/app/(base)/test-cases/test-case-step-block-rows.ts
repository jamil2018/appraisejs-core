import type { FlowDiagramStepBlock } from '@/components/diagram/flow-diagram-types'
import type { ActionResponseData } from '@/types/form/actionHandler'

export function getFlowStepBlockRows(data: ActionResponseData | undefined): FlowDiagramStepBlock[] {
  return Array.isArray(data) ? (data as FlowDiagramStepBlock[]) : []
}
