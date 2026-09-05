import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import {
  JourneyExecutionCommand,
  JourneyExecutionStartForm,
  JourneyRerunProposalForm,
  JourneyLiveRunRefresh,
} from './journey-execution-controls'

type Execution = Awaited<ReturnType<typeof getQualityJourneyExecution>>

export function JourneyExecutionStatus({
  execution,
  journeyId,
  targetProjectId,
  stateHash,
  stage,
  capsuleIds,
  environments,
}: {
  execution: Execution
  journeyId: string
  targetProjectId: string
  stateHash: string
  stage: string
  capsuleIds: string[]
  environments: Array<{ id: string; name: string }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Managed execution</CardTitle>
        <CardDescription>Inspect each run and its evidence. Reruns preserve the previous cycle.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {execution.cycles.some(cycle => ['RESERVED', 'RUNNING', 'CANCELLING'].includes(cycle.status)) ? (
          <JourneyLiveRunRefresh />
        ) : null}
        {stage === 'AUTOMATION' ? (
          <JourneyExecutionStartForm
            journeyId={journeyId}
            stateHash={stateHash}
            capsuleIds={capsuleIds}
            environments={environments}
          />
        ) : null}
        {!execution.cycles.length ? <p className="text-sm text-muted-foreground">No managed runs yet.</p> : null}
        {execution.consents
          .filter(consent => consent.status === 'REQUESTED')
          .map(consent => (
            <div key={consent.id} className="space-y-2 rounded-md border p-3">
              <h3 className="text-sm font-medium">Execution consent required</h3>
              <p className="text-sm">{consent.reason}</p>
              <dl className="space-y-1 text-xs">
                <dt className="font-medium">Execution scope</dt>
                <dd className="break-all">{consent.scope.checkpoint}</dd>
                <dt className="font-medium">Prepared scenarios</dt>
                <dd className="break-all">{consent.scope.preparedRuntimeCapsuleIds.join(', ')}</dd>
                <dt className="font-medium">Effects</dt>
                <dd>{consent.scope.actions.join(', ')}</dd>
              </dl>
              <p className="break-all font-mono text-xs text-muted-foreground">Scope: {consent.scopeHash}</p>
              <JourneyExecutionCommand
                action="consent"
                input={{ journeyId, executionConsentId: consent.id, expectedScopeHash: consent.scopeHash }}
              >
                Grant consent for this scope
              </JourneyExecutionCommand>
            </div>
          ))}
        {execution.cycles.map(cycle => (
          <section
            key={cycle.id}
            className="space-y-3 rounded-md border p-3"
            aria-label={`Execution cycle ${cycle.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="break-all text-sm font-medium">Cycle {cycle.id}</h3>
              <Badge variant="outline">{cycle.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {environments.find(environment => environment.id === cycle.environmentId)?.name ?? cycle.environmentId} ·{' '}
              {cycle.browserEngine}
            </p>
            <ul className="space-y-2">
              {cycle.testRuns.map(run => (
                <li key={run.testRunId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link
                    className="break-all underline underline-offset-4"
                    href={`/test-runs/${encodeURIComponent(run.testRunId)}?project=${encodeURIComponent(targetProjectId)}`}
                  >
                    {run.scenarioRevisionId ?? run.testRunId}: open live run and evidence
                  </Link>
                  <span>
                    {run.status} · {run.result} · {run.bindingStatus}
                  </span>
                  {run.diagnostic ? (
                    <p role="alert" className="w-full text-destructive">
                      Appraise cannot verify ownership of this process. A duplicate launch is blocked; inspect the live
                      run before retrying.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {cycle.evidence.map(receipt => (
              <p key={receipt.id} className="break-all text-xs text-muted-foreground">
                Sealed evidence {receipt.id}: {receipt.receiptHash}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              <JourneyExecutionCommand action="reconcile" input={{ journeyId, cycleId: cycle.id }}>
                Refresh terminal evidence
              </JourneyExecutionCommand>
              {['RESERVED', 'RUNNING', 'CANCELLING'].includes(cycle.status) ? (
                <JourneyExecutionCommand
                  action="cancel"
                  input={{
                    journeyId,
                    cycleId: cycle.id,
                    expectedStateHash: stateHash,
                    reason: 'User requested cancellation from Journey overview.',
                  }}
                >
                  Cancel this cycle
                </JourneyExecutionCommand>
              ) : null}
            </div>
            <JourneyRerunProposalForm
              journeyId={journeyId}
              cycleId={cycle.id}
              evidenceIds={cycle.evidence.map(receipt => receipt.id)}
              scenarioRevisionIds={[
                ...new Set(cycle.testRuns.flatMap(run => (run.scenarioRevisionId ? [run.scenarioRevisionId] : []))),
              ].sort()}
            />
          </section>
        ))}
        {execution.proposals.map(proposal => (
          <div key={proposal.id} className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">Selective rerun · {proposal.status}</h3>
            <p className="text-sm">{proposal.reason}</p>
            <p className="break-all text-xs">
              Scenarios: {(proposal.selectedScenarioRevisionIds as string[]).join(', ')}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">Scope: {proposal.proposalHash}</p>
            {proposal.status === 'PROPOSED' ? (
              <JourneyExecutionCommand
                action="approve"
                input={{ journeyId, proposalId: proposal.id, expectedProposalHash: proposal.proposalHash }}
              >
                Approve this rerun scope
              </JourneyExecutionCommand>
            ) : null}
            {proposal.status === 'APPROVED' ? (
              <JourneyExecutionStartForm
                journeyId={journeyId}
                stateHash={stateHash}
                capsuleIds={[]}
                environments={environments}
                proposalId={proposal.id}
              />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
