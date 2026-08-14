import { StatusBadge } from '@/components/ui/status-badge'

type EvidenceReceipt = {
  id: string | null
  validationVersionId: string | null
  resultMatrixCell: string | null
  assuranceLevel: string | null
  outcome: string | null
  runtimeInputHash: string | null
  environmentSnapshotHash: string | null
  browserSnapshotHash: string | null
  dataProvenanceHash: string | null
  outputHash: string | null
  reportHash: string | null
  logHash: string | null
  traceHash: string | null
  receiptHash: string | null
  sealedAt: Date | null
}

type EvidenceReviewProps = {
  evidenceReceipts: EvidenceReceipt[]
  validationVersions: Array<{ id: string; validationIdentity: string; status: string; design: unknown }>
  baseline: { assessmentId: string; status: string; evidenceReceiptCount: number; decision: string | null } | null
  runtimeCells: Array<{ validationVersionId: string; resultMatrixCell: string }>
}

function limitations(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as { limitations?: unknown }
  if (Array.isArray(item.limitations))
    return item.limitations.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
  return typeof item.limitations === 'string' && item.limitations.trim() ? [item.limitations] : null
}

function outcomeTone(outcome: string | null) {
  if (outcome === 'PASSED') return 'success' as const
  if (outcome === 'FAILED') return 'danger' as const
  if (outcome === 'BLOCKED') return 'warning' as const
  return 'neutral' as const
}

export function AssessmentEvidenceReview({
  evidenceReceipts,
  validationVersions,
  baseline,
  runtimeCells,
}: EvidenceReviewProps) {
  const validationById = new Map(validationVersions.map(validation => [validation.id, validation]))
  const receiptByCell = new Map(
    evidenceReceipts.map(receipt => [`${receipt.validationVersionId}:${receipt.resultMatrixCell}`, receipt]),
  )
  return (
    <section className="space-y-6" aria-label="Evidence review">
      <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] p-4">
        <h2 className="text-base font-semibold">Evidence matrix</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each published validation version must contribute an immutable, sealed result for the complete matrix.
        </p>
        {evidenceReceipts.some(receipt => receipt.outcome === 'BLOCKED') ? (
          <p className="mt-3 text-sm text-amber-200">
            Human verification stopped managed automation. The sealed blocked receipt records the boundary but does not
            evaluate the target; start a fresh TestRun after the challenge is cleared.
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto rounded-md border border-white/[0.08]" tabIndex={0}>
          <table className="min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Validation</th>
                <th className="p-3">State</th>
                <th className="p-3">Matrix cell</th>
                <th className="p-3">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {runtimeCells.map(cell => {
                const validation = validationById.get(cell.validationVersionId)
                const receipt = receiptByCell.get(`${cell.validationVersionId}:${cell.resultMatrixCell}`)
                return (
                  <tr
                    className="border-b border-white/[0.06] last:border-0"
                    key={`${cell.validationVersionId}:${cell.resultMatrixCell}`}
                  >
                    <td className="p-3 font-medium">{validation?.validationIdentity ?? cell.validationVersionId}</td>
                    <td className="p-3">
                      <StatusBadge label={validation?.status.toLocaleLowerCase() ?? 'unknown'} />
                    </td>
                    <td className="p-3 font-mono text-xs">{cell.resultMatrixCell}</td>
                    <td className="p-3">
                      <StatusBadge
                        label={receipt?.outcome?.toLocaleLowerCase() ?? 'Not sealed'}
                        tone={outcomeTone(receipt?.outcome ?? null)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] p-4">
          <h2 className="text-base font-semibold">Evidence details</h2>
          {evidenceReceipts.length ? (
            <ul className="mt-4 space-y-4">
              {evidenceReceipts.map(receipt => (
                <li className="rounded-md border border-white/[0.08] p-3" key={receipt.id ?? receipt.receiptHash}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      label={receipt.outcome?.toLocaleLowerCase() ?? 'Unknown'}
                      tone={outcomeTone(receipt.outcome)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {receipt.assuranceLevel?.toLocaleLowerCase() ?? 'assurance unavailable'}
                    </span>
                  </div>
                  <Hash label="Receipt" value={receipt.receiptHash} />
                  <Hash label="Runtime input" value={receipt.runtimeInputHash} />
                  <Hash label="Output" value={receipt.outputHash} />
                  <Hash label="Report" value={receipt.reportHash} />
                  <Hash label="Log" value={receipt.logHash} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No evidence has sealed yet. Reconcile terminal managed runs to preserve partial receipts.
            </p>
          )}
        </div>
        <div className="space-y-6">
          <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] p-4">
            <h2 className="text-base font-semibold">Known validation limitations</h2>
            <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
              {validationVersions.flatMap(validation =>
                (limitations(validation.design) ?? []).map(item => (
                  <li key={`${validation.id}-${item}`}>
                    <span className="font-medium text-foreground">{validation.validationIdentity}: </span>
                    {item}
                  </li>
                )),
              )}
            </ul>
            {!validationVersions.some(validation => limitations(validation.design)?.length) ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No limitations were recorded in the validation designs.
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] p-4">
            <h2 className="text-base font-semibold">Baseline comparison</h2>
            {baseline ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Baseline {baseline.assessmentId} is {baseline.status.toLocaleLowerCase()} with{' '}
                {baseline.evidenceReceiptCount} sealed receipts
                {baseline.decision ? ` and a ${baseline.decision.toLocaleLowerCase()} decision` : ''}. Compare its
                evidence receipts before deciding this Assessment.
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No baseline Assessment is linked to this review.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Hash({ label, value }: { label: string; value: string | null }) {
  return value ? (
    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
      {label}: {value}
    </p>
  ) : null
}
