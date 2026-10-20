# Advisory observation: runtime module resolution is part of the input boundary

Observation `obs-88caa0c6ebf22842`; 2026-10-16. Scope: M02 trusted-agent T1 preparation. This is advisory evidence, not a change to agent routing, permissions or quality gates.

An explicit synthetic database URL and cleared process environment did not prevent the generated Prisma client from loading a repository environment file at module initialization. The dependency's own location determined its relative environment path. The r2 offline runtime candidate was therefore held REVISE before any native launch, despite its passing fake-port checks.

The additive r3 candidate stages intact pinned modules in a fresh owned tree outside the repository, verifies both import/require resolution and copied hashes, and imports from that tree. A fresh offline test guards environment-file reads before importing the backend and using staged Prisma against disposable SQLite. It passes without environment-file contents being read. That check covers the known JavaScript dependency path; it is not OS filesystem isolation or live native qualification.

Reusable lesson: an exact executable identity includes dependency-resolution context and module-load side effects. Passing explicit configuration values does not establish absence of ambient file inputs. Keep ordinary protocol tests, dependency-import checks and live observations separate. Preserve a discovered counterexample and its prior review rather than rewriting historical acceptance.

Evidence: the additive M02 runtime preparation 02 and its exact T1 request 02; r2 source/archive and REVISE history remain retained locally. Promotion into a mandatory harness policy or gate would require separate user direction.
