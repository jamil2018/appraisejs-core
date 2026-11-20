import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import {
  JourneyExecutionCommand,
  JourneyExecutionStartForm,
  JourneyRerunProposalForm,
} from './journey-execution-controls'

type Execution = Awaited<ReturnType<typeof getQualityJourneyExecution>>

function readable(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ')
}

function permissionTarget(checkpoint: string, environments: Array<{ id: string; name: string }>) {
  const target = /^START_EXECUTION:(.+):(CHROMIUM|FIREFOX|WEBKIT)$/.exec(checkpoint)
  if (!target) return checkpoint
  const environment = environments.find(item => item.id === target[1])
  return `${environment?.name ?? target[1]} · ${readable(target[2]!)}`
}

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
        <CardTitle className="text-base">Run tests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {stage === 'AUTOMATION' ? (
          <JourneyExecutionStartForm
            journeyId={journeyId}
            stateHash={stateHash}
            capsuleIds={capsuleIds}
            environments={environments}
          />
        ) : null}

        {execution.consents
          .filter(consent => ['REQUESTED', 'GRANTED'].includes(consent.status))
          .map(consent => (
            <div key={consent.id} className="space-y-2 rounded-md border p-3">
              <h3 className="text-sm font-medium">
                {consent.status === 'GRANTED' ? 'Permission granted' : 'Allow these tests to run?'}
              </h3>
              <p className="text-sm">{consent.reason}</p>
              <dl className="space-y-1 text-xs">
                <dt className="font-medium">Target</dt>
                <dd className="break-all">{permissionTarget(consent.scope.checkpoint, environments)}</dd>
                <dt className="font-medium">Prepared scenarios</dt>
                <dd>{consent.scope.preparedRuntimeCapsuleIds.length}</dd>
                <dt className="font-medium">Effects</dt>
                <dd>{consent.scope.actions.map(readable).join(', ')}</dd>
              </dl>
              <details>
                <summary className="cursor-pointer text-xs">Permission details</summary>
                <p className="break-all font-mono text-xs">{consent.scopeHash}</p>
                <p className="break-all text-xs">{consent.scope.preparedRuntimeCapsuleIds.join(', ')}</p>
              </details>
              <div className="flex flex-wrap gap-2">
                {consent.status === 'REQUESTED' ? (
                  <JourneyExecutionCommand
                    action="consent"
                    input={{ journeyId, executionConsentId: consent.id, expectedScopeHash: consent.scopeHash }}
                  >
                    Allow these tests
                  </JourneyExecutionCommand>
                ) : null}
                <JourneyExecutionCommand
                  action="revokeConsent"
                  input={{ journeyId, executionConsentId: consent.id, expectedScopeHash: consent.scopeHash }}
                >
                  {consent.status === 'GRANTED' ? 'Revoke this consent' : 'Decline'}
                </JourneyExecutionCommand>
              </div>
            </div>
          ))}
        {execution.cycles.map(cycle => (
          <section
            key={cycle.id}
            className="space-y-3 rounded-md border p-3"
            aria-label={`Execution cycle ${cycle.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Test run</h3>
              <Badge variant="outline">{readable(cycle.status)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {environments.find(environment => environment.id === cycle.environmentId)?.name ?? 'Selected environment'}{' '}
              · {cycle.browserEngine}
            </p>
            <ul className="space-y-2">
              {cycle.testRuns.map((run, index) => (
                <li key={run.testRunId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link
                    className="break-all underline underline-offset-4"
                    href={`/test-runs/${encodeURIComponent(run.testRunId)}?project=${encodeURIComponent(targetProjectId)}`}
                  >
                    View test run {cycle.testRuns.length > 1 ? index + 1 : ''} and evidence
                  </Link>
                  <span>{readable(run.result && run.result !== 'PENDING' ? run.result : run.status)}</span>
                  {run.diagnostic ? (
                    <p role="alert" className="w-full text-destructive">
                      Appraise cannot verify ownership of this process. A duplicate launch is blocked; inspect the live
                      run before retrying.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {cycle.evidence.length ? (
              <details className="text-muted-foreground">
                <summary className="cursor-pointer text-xs">Technical details and sealed evidence</summary>
                {cycle.evidence.map(receipt => (
                  <p key={receipt.id} className="mt-1 break-all font-mono text-[11px]">
                    Sealed evidence {receipt.id}: {receipt.receiptHash}
                  </p>
                ))}
              </details>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <JourneyExecutionCommand action="reconcile" input={{ journeyId, cycleId: cycle.id }}>
                Check for results
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
                  Cancel run
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
            <p className="text-xs">{(proposal.selectedScenarioRevisionIds as string[]).length} scenarios selected</p>
            <details>
              <summary className="cursor-pointer text-xs">Rerun details</summary>
              <p className="break-all text-xs">{(proposal.selectedScenarioRevisionIds as string[]).join(', ')}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">Scope: {proposal.proposalHash}</p>
            </details>
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
