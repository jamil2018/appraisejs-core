export function AnalysisApprovalReceipt({ revision }: { revision: number }) {
  return (
    <p className="rounded-lg border border-success-border bg-success-surface px-3 py-2 text-sm font-medium text-success">
      Test approach revision {revision} approved.
    </p>
  )
}
