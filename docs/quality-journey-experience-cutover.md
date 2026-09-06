# Quality Journey Authority Cutover

The Control navigation contains Dashboard followed by Quality Journeys. Quality Journey is the sole user-facing and
agent-enabled quality workflow.

The unreleased Quality Plan and Assessment experiences were deleted without redirects, compatibility pages, data
conversion, exporters, or deprecated aliases. Historical development plans remain archival documents only and are
not current product contracts.

Existing development databases that applied the removed August 2026 migration chain must be reset. The consolidated
Journey migration supports fresh databases and rehearsal from the last retained July schema; it intentionally does
not preserve removed-domain rows.

Independent Test Runs remain in the Execution area as non-authoritative diagnostics. Their reports and logs help
debug authored automation, but only sealed Journey evidence and Journey review/closure records establish quality
outcomes.
