import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { auditedCanonicalRead } from './fixtures/codex-app-server-m02-ta-r24-audit-investigation-01/sdk-audit.mjs'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { DurablePhaseJournal } from './fixtures/codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { createMatrixAuditSession } from './fixtures/codex-app-server-m02-ta-matrix-r10/audit-session.mjs'
import { prepareCodeModeCall, decodeCodeModeContinuation } from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'

for (const transportKind of ['in-memory', 'stdio'])
  for (const missingAudit of [false, true])
    test(`actual SDK ${transportKind}: ${missingAudit ? 'withheld external audit remains refused' : 'child audit and generated script correlate'}`, async () => {
      const directory = fs.mkdtempSync('/private/tmp/m02-r24-audit-offline-01-')
      fs.chmodSync(directory, 0o700)
      const journal = DurablePhaseJournal.create({ directory, phase: 'T2' })
      journal.begin('B01')
      const auditSession = createMatrixAuditSession({ caseId: 'B01', journal })
      let planned, payload
      try {
        const observed = await auditedCanonicalRead(loadSealedRouteEvidence(), {
          transportKind,
          // Only the external audit HTTP exchange is fake. A withheld report does not model R24's cause.
          report: event => (missingAudit ? { status: 'ACKNOWLEDGED' } : auditSession.observe(event)),
          invoke: async ({ client, read, tools }) => {
            planned = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: read.toolName, args: read.arguments })
            auditSession.issue(planned)
            const registry = tools.map(tool => ({ name: `mcp__appraise_m02__${tool.name}` }))
            const emitted = []
            await vm.runInNewContext(
              `(async()=>{${planned.script}\n})()`,
              {
                ALL_TOOLS: registry,
                tools: { [planned.normalizedName]: args => client.callTool({ name: read.toolName, arguments: args }) },
                text: value => emitted.push(value),
              },
              { timeout: 1000 },
            )
            assert.equal(emitted.length, 1)
            payload = emitted[0]
            return JSON.parse(payload).result
          },
        })
        assert.equal(observed.results.length, 1)
        assert.equal(observed.events.length, 2)
        assert.equal(observed.unknowns, 0)
        assert.deepEqual(observed.transportSnapshot, { pending: 0, fenced: false })
        const snapshot = auditSession.snapshot()
        assert.equal(snapshot.pending, 0)
        assert.equal(snapshot.scopedDispatchCount, missingAudit ? 0 : 1)
        assert.equal(journal.snapshot().counts.B01.scopedCalls, missingAudit ? 0 : 1)
        assert.deepEqual(journal.snapshot().pending, [])
        const input = [
          {
            type: 'custom_tool_call_output',
            call_id: planned.callId,
            output: [
              { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
              { type: 'input_text', text: payload },
            ],
          },
        ]
        const scopedAudit = snapshot.calls.map(call => ({
          callId: call.callId,
          normalizedName: planned.normalizedName,
          id: call.rpcId,
          operation: call.name,
          argumentsHash: call.argumentsSha256,
          complete: true,
          result: call.result,
        }))
        if (missingAudit)
          assert.throws(() => decodeCodeModeContinuation({ input, planned, audit: scopedAudit }), /SCOPED_AUDIT_COUNT/)
        else {
          assert.equal(decodeCodeModeContinuation({ input, planned, audit: scopedAudit }).status, 'RESULT_CORRELATED')
          auditSession.complete()
        }
        assert.deepEqual(externalEffectAttempts, [])
      } finally {
        journal.close()
        // Only this fresh offline test directory; no native campaign or historical cleanup.
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })
