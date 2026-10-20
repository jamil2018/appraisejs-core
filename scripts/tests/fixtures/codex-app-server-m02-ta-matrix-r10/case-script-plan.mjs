/** Finite policy-to-script argument binding for disposable canonical fixtures. */
import { casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

export async function buildMatrixCaseOperations({ caseId, fixture, canonicalPacket }) {
  const item = casePolicy(caseId)
  if (item.phase !== 'T2' || ['P00', 'B14'].includes(caseId)) throw new Error('case has no reviewed Code Mode plan')
  if (
    !fixture?.gateway?.binding ||
    !Array.isArray(fixture.gateway.frozenReads) ||
    typeof canonicalPacket !== 'function'
  )
    throw new Error('canonical fixture binding required')
  const operations = []
  for (const [index, step] of item.script.operations.entries()) {
    let args
    const rejection = /^B07-A(?:09|1[0-4])$/.test(caseId)
    if (rejection) {
      if (index !== 0 || step.argumentsRef !== 'empty') throw new Error('registry absence multiplicity')
      args = {}
    } else if (
      step.argumentsRef === 'empty' ||
      step.argumentsRef === 'query-fixture' ||
      step.argumentsRef === 'sealed-1-log-page'
    ) {
      const read = fixture.gateway.frozenReads.find(entry => entry.toolName === step.toolName)
      if (!read) throw new Error('frozen read missing for policy operation')
      args = structuredClone(read.arguments)
    } else if (step.argumentsRef?.startsWith('synthetic-')) {
      args = canonicalPacket(item.role, fixture.gateway.binding)
      if (step.argumentsRef === 'synthetic-analyzer-packet-plus-mutation') {
        if (item.script.mutation?.location !== 'top-level') throw new Error('top-level mutation contract')
        args[item.script.mutation.field] = item.script.mutation.value
      } else if (step.argumentsRef === 'synthetic-designer-packet-plus-mutation') {
        if (item.script.mutation?.location !== 'result' || !args.result) throw new Error('result mutation contract')
        args.result[item.script.mutation.field] = item.script.mutation.value
      }
    } else if (step.argumentsRef === 'foreign-log-page') {
      if (caseId !== 'B07-T01' || typeof fixture.seedForeignTriageReceipt !== 'function')
        throw new Error('foreign frozen key fixture missing')
      const seeded = await fixture.seedForeignTriageReceipt()
      args = { ...item.script.arguments, receiptId: seeded.foreignReceiptId }
    } else throw new Error('unreviewed argument reference')
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('operation arguments missing')
    operations.push(Object.freeze({ operation: step.toolName, args, rejection }))
  }
  return Object.freeze(operations)
}
