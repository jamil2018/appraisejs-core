# M13 closed snapshot recovery candidate

This task implements offline recovery preparation and observation. It does not authorize an actual native case or
qualify M13, provider termination, physical reconciliation, hostile containment, or a production reader identity.
`BOUND_DISPOSABLE_PROJECT_READER` is a task-local scope, not an authenticated mutation principal.

The snapshot decision is the retained `resume-20261116-1414/RECOVERY-SNAPSHOT-DECISION.md` in the qualification
worktree; current loss-controller integration and engineering cadence follow [the integrated backlog](M13-INTEGRATED-IMPLEMENTATION.md) and the user's latest instructions. Historical GaElq5 and other spent cases remain unchanged. The earlier URI `mode=ro` write-success failure
remains a failure; this implementation uses a new closed, checkpointed copy with file mode 0444 and directory mode 0555. These modes protect against accidental writes. A process with the same UID can change them; no host isolation
is attested.

## Original task boundaries

The optional strict `recoveryCase` packet discriminator is checked before initial fixture preparation. R2 uses
`R2_NATIVE_START_ACK_LOSS` and R3 uses `R3_ACCEPTED_ANALYSIS_REPLY_LOSS` through one shared original loss controller.
Legacy acknowledgement-loss aliases and authenticated worker-receipt replay remain unsupported. Recovery packets
cannot enter follow-up, discovery, next-role, or Triager preparation. Earlier success-to-error tests remain preserved
as narrower historical evidence; the current R3 path destroys the selected original HTTP socket and returns accepted
data internally so the real SDK handler can settle without an outward response.

For a separately reviewed R1 packet, `start-recovery-case` enters the original once-only start Promise and immediately
returns `START_ENTERED`. That result is not an acknowledgement. `poll-recovery-boundary` is limited to 1000 calls and
300 seconds. R1 readiness requires the original supervisor's fulfilled start, entered native `turn/start`, and
observed native turn ID, plus active original supervision and `completed=false`; an armed intent, unresolved Promise,
live app-server process, requested turn, or synthetic test double does not qualify an actual ACK or active turn.
The original fixture also checks canonical Analysis, so a committed artifact whose outward receipt was lost still
refuses R1. Completion is checked again immediately before task-owned cancellation. If completion won, the task
preserves PAUSED/UNKNOWN cleanup evidence and explicitly records R1 as unqualified.

`pause-recovery-case` accepts only the matching case, exact version/hash, and idempotency key. The original fixture
supplies Journey/project scope and `SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R1`. Local successor and gateway admission are
fenced before the canonical pause call. The task awaits a proven canonical PAUSED receipt before invoking its own
original cancellation and retention. Canonical pause may separately clean up registered original handles after its
transaction commits; those observations do not become task-owned protocol interruption evidence. The task names its
boundary `ORIGINAL_OWNED_PROCESS_CANCELLATION`.

Uncertain or stale pause replies permanently fence delivery, request emergency cleanup through original owners, and
produce `PAUSE_COMMIT_UNPROVEN`. No implicit pause retry, successor, correction, turn, restored assignment, or new
sender is admitted. Original task cancellation is memoized, including delayed task creation after cancellation.

R2 accepts only the original private parser's validated result for the actually written native `turn/start`. It never
uses a request/intent marker or a canonical MCP receipt as an ACK substitute, and canonical gateway admission is
blocked for the entire case. R3 authorizes selection of the first eligible, authorized, normalized Analysis call;
generated arguments and future artifact IDs are not preparation-time approvals. Its raw worker-argument digest,
normalized digest, canonical charter hash, worker input hash, native envelope digest, request payload digest, result
digest, and accepted artifact ID/hash remain separately named.

The shared controller owns one canonical pause Promise and reads through its original client every 25 ms, at most
200 times, within five seconds or the existing absolute cleanup deadline. R2 uses the fixed predecessor; R3 binds
the exact post-accept state once. Physical cleanup waits for the exact committed pause event/request hash and
successor; a local callback cannot assert commit. `retain-recovery-case` joins the original cleanup and preserves
pending original operations. It never issues a second pause, rebases, or retries. Late pause/read work prevents
disconnect, checkpoint, and snapshot sealing.

## Closed reader

`seal-recovery-reader` requires the canonical pause receipt and settled original cleanup/retention. R1 retains the
original task cancellation result and requires its stopped supervisor state plus stopped owned-child receipt,
observed process-group exit, removed private root, and no retained private root. A fulfilled uncertain cancellation
keeps cleanup unproven and the original source/client retained; a later physical settlement cannot upgrade that
original uncertain result. Sealing, source-writer disposal, checkpoint, and disconnect refuse that boundary. Other original
source writers must close through their original disposal path. The still-original fixture client verifies a SQLite
checkpoint and disconnects only after its original fixture flight has settled. Missing closure or transaction proof
refuses sealing. No replacement writer is opened to perform a checkpoint.

The preparer exclusively creates a new snapshot directory, checks source identity/hash before and after copying,
requires matching copy bytes and absent/empty original sidecars, and seals file/directory modes and provenance.
The strict binding carries only case, read actor, Journey/project/version/hash, pause event, captured attempt,
optional Analysis ID/hash, and the sealed snapshot identity. Extra keys, arbitrary paths, symlinks, hardlinks,
permission changes, file or directory identity drift, provenance drift, extra entries, and sidecars refuse reads.

The original parent privately retains the sealed source file/directory/sidecar witness. It checks that witness before
launch and after every successful, refused, or errored read, including wrong-scope refusals. This is filesystem
identity/hash evidence only: it never queries or reopens the original database. The source path and witness stay
outside the child binding and provide no sender or source-custody authority.

The reader imports only `recovery-read-binding.mts` for the closed binding, schema, and read-only integrity checks.
Host sealing, original-source witnesses, and child-flight state stay in `recovery-snapshot.mts`; the reader does not
import that host module. Launcher pins cover the reader, read-binding checks, host, and original-flight helper.
The local digest serializer retains code-unit key ordering and its existing undefined-value behavior.

`read-recovery-snapshot` launches a genuinely fresh Node process with a fresh cwd/HOME, explicit pinned Node/tsx/root
tsconfig/reader inputs, and a closed environment. The snapshot datasource is set both explicitly and through
`DATABASE_URL`. The identical Prisma client enters `globalThis.prisma` before any canonical service import.
No credential descriptor or provider-auth bootstrap enters this reader. Explicit datasource/global-client setup,
the closed environment, reviewed canonical readers, and read-only permissions enforce the stated path. Test-only
sentinels observe zero `.env`, default-database, credential, network, native-process, and file-write calls around that
same entry. The runtime reader installs no global monkeypatches. This fixed trust scope is not hostile-process
containment.

The same finite reader deadline includes reserved shutdown time. A timeout requests stop through the actual original
ChildProcess, then waits for its observed exit and close within that deadline. Only observed closure permits final
source/copy integrity sampling. If closure is still unobserved at the hard deadline, output is explicitly
UNKNOWN/unqualified, the original pending flight is retained, and no final integrity or quiescence is certified. That
witness cannot launch a replacement reader. Stdout remains capped and raw errors/stderr remain private.

The reader invokes only canonical status, Journey, factory-evidence, and optional Analysis readers. A read transaction
evaluates provider quiescence, replacement safety, and the matching hosting-cleanup guard. It never invokes either
resume API, which can mutate or retry cleanup. Output is a strict finite DTO with a frozen-snapshot observation
surface, no raw errors/events/artifact contents, no restored credentials or sender, and no live-state claim.
`observedAt` is projection computation time. `UNRESOLVED` is a guard projection; it does not reconstruct exact
ProviderRun or HUB rows or resolve physical uncertainty.

## Offline evidence

All new evidence is under the candidate worktree's `.appraisejs/recovery-task-candidate/`. Earlier failed proof
attempts are retained. Tests create only new disposable SQLite fixtures and use canonical services to create,
admit, accept Analysis, and pause them. Synthetic armed intent uncertainty is retained without consuming a send
permit, launching native/provider/browser work, or inferring actual native acknowledgement.

- Full fresh-process canonical API/guard route: PAUSED scope, version/hash, pause event, captured attempt, and Analysis
  ID/hash match. Provider effects remain UNRESOLVED; replacement, transfer, and hosting cleanup are REFUSED with
  missing original handles. Wrong Journey/project/version/hash/event/attempt bindings refuse. Analysis missing and
  mismatched projections remain finite. Source and copy identities, hashes, sizes, mtimes, modes, entries, and
  sidecar absence remain unchanged.
- Parent witness regressions detect source replacement, content changes, sidecar appearance, and directory mode
  changes after both an actual successful reader and an actual wrong-scope refusal. Drifted disposable sources remain
  preserved; subsequent reads refuse before spawning. In-memory original-child tests cover delayed close after stop,
  exit without close, and a never-closing child with no false final integrity proof or deadline extension.
- A separate sacrificial copied database rejects an attempted UPDATE with Prisma P2010; its bytes and identity stay
  unchanged. The reader itself contains no write probe, chmod, restoration, migration, checkpoint, or fallback.
- R1 controlled Promise tests cover nonblocking start, no inferred ACK, pause commit before task cancellation,
  duplicate commands, stale/uncertain pause, acceptance races, delayed starts, and finite polling. Unsupported aliases
  refuse before fixture allocation. The source-owned R2 test uses a genuine private parser receipt and actual SDK
  suppression. The R3 task E2E uses a genuine inert Node/SDK turn, one healthy Analysis read and exactly one canonical
  submission, actual zero-byte HTTP loss, exact pause, original group/drain/root cleanup, and fresh canonical artifact
  matching. Hosting cleanup passes when those original handles are observed; provider effects and replacement/transfer
  refusal remain separate.

The full canonical copied-fixture proof covers SQLite DELETE mode, matching the currently admitted native source's
`journal_mode=delete` requirement. It does not qualify WAL mode or universal SQLite read-only compatibility.

Focused validation uses Node's test runner for `recovery-case.test.mts`, `recovery-lineage.test.mts`, `recovery-snapshot.test.mts`, `recovery-reader-flight.test.mts`,
`native-driver.test.mts`, `native-run.test.mts`, `runner.test.mts`, and the genuine inert `native-loss.integration.test.mts`; the matching package loopback test uses the real SDK. Checks include affected-file ESLint/Prettier and a files-only
TypeScript project for all changed task modules and new tests, with a 2 GiB heap cap. Full-project TypeScript, build, template sync,
Graphify generation, install, commits, push, merge, publication, and actual native recovery cases are outside this
assignment. Existing dependencies are used through read-only symlinks; the candidate CLI build now has its own local dist output.

New Node test entries and the dynamically preloaded test sentinel are registered in the existing M13 Fallow test-role
entry list. The reader is reachable through its literal task URL. This is reachability registration, not a suppression
or baseline change.

Remaining engineering work is the settled loss-controller integration, integrated E2E, and one independent evaluation
of the final integrated artifact after E2E works. Actual native R1/R2/R3 runtime cases with real original observations
remain separately authorized work, with Appraise lifecycle and provider/physical qualification gates unchanged.
Offline results do not satisfy those runtime gates.
