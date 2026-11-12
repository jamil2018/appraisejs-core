# Separate cold migration setup from a case deadline

Advisory observation for localized fixes; no harness policy, model, permission or quality gate change.

Post-merge CI `43273943993` timed out the first execution SQLite case at five seconds. Its lazy fixture performs
the genuine migration command only on the first call. A six-second controlled delay before that command reproduces
the first-case failure; preparing the same template in suite setup passes without altering case deadlines,
assertions, migrations or existing runtime skips. The exact historical slow operation remains UNKNOWN.

Keep cold shared preparation in a setup boundary and preserve separate case databases. A successful delayed fixture
experiment establishes that boundary, not the cause of an earlier uninstrumented CI failure. Retain both observations
and require a fresh exact-artifact CI run rather than retrying the same failed workflow until green.

The investigation used one read-only evidence lane and coordinator implementation. Requested roles and bounded context
do not prove effective model, context isolation or sandbox enforcement. The local route command initially rejected
an unsupported task-class value; the corrected `localized-fix` receipt records that tooling correction without changing
the router or manufacturing runtime proof. Detailed evidence: [M12 follow-up](../../../tasks/codex-app-server-journeys/M12-POST-MERGE-CI.md).
