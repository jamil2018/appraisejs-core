import type { NodeFormProps } from './node-form-helpers'

export type NodeFormFieldsProps = Omit<NodeFormProps, 'showAddNodeDialog' | 'setShowAddNodeDialog'>
