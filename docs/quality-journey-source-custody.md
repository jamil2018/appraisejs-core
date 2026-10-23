# Synthetic provider outcome custody

The internal M06 synthetic lane binds an original hard-discard sender to the canonical provider intent. It can establish only fixture `NONSTART`: the original owned sink discarded every charged byte and the original sender cannot issue a delayed send. It supplies no provider, MCP or native `TERMINAL` authority and does not enable production dispatch. Full M06 and real-provider qualification remain separate from this repository repair.

## One canonical writer

`provider-source-database.ts` owns the genuine Prisma client and a separately prepared committed-read resolver from the same loaded generated client and native query-engine library. Source rows, bounded ledger records and canonical provider state use that original writer. Source initialization, reservation, flush and sealing are asynchronous transactions; every helper uses the supplied transaction rather than issuing a parent-client query inside it.

The owning process never opens the canonical database through Node SQLite or another SQLite implementation, and never reads, hashes or backs up its database contents while the engine may own operations. Metadata realpath/device/inode checks and hashes of static code/native-library files are distinct from database-content inspection. Independent native contenders and post-exit inspectors run in separate fixture processes.

The binding verifies actual native-library identity, explicit database identity and effective connection settings. Its canonical and resolver pools are limited to one connection; that limit alone does not prove permanent connection affinity. Each authoritative transaction verifies its actual settings. The resolver uses one bounded joined SELECT that returns its own connection flags and file binding. `query_only` prevents its writes; it is not a physically read-only database-open claim. The row-returning busy-timeout setter uses the query API and verifies zero.

## Original capture and commit

The source reserves a bounded exact observation window before original callbacks are enabled. Synchronous capture retains immutable metadata only, including actual allocation holes, original byte ranges and original dispositions. It issues and schedules no SQL and retains no frame, arbitrary work callback or deferred send. The real send stays inside the existing coordinator ownership-CAS transaction. No await separates its final synchronous checks from entry into the original write gate. The actual reply Promise remains boxed and is observed outside the transaction.

Only known outer fulfillment permits the reserved batch to flush and seal. Synchronous inspection checks original private identities and sealed local metadata; it does not establish current database health or authorize release by itself. Fresh reconciliation first performs its full-scope conditional SourceState write barrier as the first application SQL, then checks actual settings, complete bounded state/ledger data and existing canonical reconciliation rules in that same transaction. The source commit binding and full reconciliation receipt commit atomically with the canonical outcome. Before that transaction, the original hold pins its observation key, internally derived request hash, complete receipt and database identity. Committed replay can resolve only that exact reconciliation hold and its recorded retention cause; an older result cannot clear another request or source phase.

## Retirement, disposal and replay

Actual owner, key, exclusion, receipt, clients and pending operations stay retained through initialization, reservation, send, persistence and reconciliation. A rejected or timed-out outer operation remains UNKNOWN unless an exact positive committed result resolves it. A negative read, error class, elapsed deadline or process-cleanup request cannot establish engine quiescence. Actual client, prototype, engine and native disconnect paths are held through protected or unresolved operations. Each cleanup layer owns its published completion promise and retains the genuine underlying operation. Dependencies run from client to engine to native. Binding disposal requires full completion of both clients; a native completion flag cannot establish that result. Eligible source finalization runs synchronously while its exact database hold still blocks cleanup. Only afterward does the hold end and queued cleanup enter. A cleanup failure retains the actual remaining operations and binding; it never recreates legitimately destroyed source authority. Repeated cleanup returns its original layer promise before any new factory-slot admission.

Eligible source disposal zeroes its live key and clears its owned receipt reference and live maps. Clearing a JavaScript receipt reference is not evidence that immutable string memory was overwritten. The preowned resolver belongs to the database binding and remains available for exact committed replay after source disposal. Canonical-only cleanup closes future source-write admission while the surviving preowned reader remains available for bounded exact committed replay. Final binding or resolver cleanup closes new read admission. Previously admitted protected phases and eligible resolution reads retain their original private operation capability through completion. These gates govern repository-owned source, transaction and replay admissions; a database token or shared hold count grants no new operation. Explicit binding cleanup is separate; a closed binding cannot reconnect or create another resolver. A closing binding retains the factory lane until both full client cleanups and every hold and lookup have completed without unresolved cleanup layers. A bounded original proof/exclusion tombstone can identify its exact committed result, but cannot reconstruct a live proof, source or key.

Exact legacy committed replay does not require a new SourceState row. It must match the actual canonical identity and request/evidence hashes with the complete stored reconciliation receipt; a missing stored receipt refuses replay and cannot be invented or backfilled. Fresh legacy filesystem evidence and forged or cloned source objects do not enroll into the sole-Prisma custody lane. Replay grants no new send, refund, replacement, turn or physical release.

## Verification boundary

### Direct controller lifetime

The source fixture case algorithm runs in a standalone Node process. Direct case, campaign and supervisor entries install their failure boundary before owned work. The launch path retains the actual returned child and attaches its error listener before descriptor closure, publication or observers can fail. An unresolved failure preserves the first cause and the original controller resources; it cannot authorize cleanup, retry or process exit.

The three Vitest wrappers use a finite standalone transport. A nonce-bound result is accepted only after the original child exits with code zero and no signal and the immutable result matches the exact request, controller and case. Lost or foreign results and transport failures remain `TRANSPORT_UNKNOWN`. The wrapper does not claim to preserve its own JavaScript objects after a test worker exits; custody of the actual source resources belongs to the independent controller. The exact topology and operations have independent review. All 18 normal and two fault selectors now have original-controller exit-zero results and independent result acceptance. Ten establish known owner exit; eight establish callback-committed retention; two validate IPC-fault retention. The successful cases span three frozen packet generations. Independent branch review found the earlier passes applicable to unchanged executed branches; this does not claim that all 20 ran the newest packet. Retained observations establish point-in-time liveness only. Failed source-happy and journal-binding predecessors remain retained. Their fixture corrections bind the actual owner-generated source ID and expect the existing first discard-window guard, respectively.

### Source SQLite fixture client inputs

The source fixture builder is `scripts/test-harness/m06/source-custody/build-source-custody.mjs`. Its
`buildSourceCustodyPacket(directory, staticClient, physicalReview)` API requires a fresh absolute packet directory.
The optional `physicalReview` is an exact `{ filename, sha256, bytes }` record for an independent
`EXACT_SOURCE8_PHYSICAL_CLIENT_BINDING` ACCEPT. That review binds the physical binding receipt/digest, actual client
entry and owned env-root, both original-client and copied-output provenance reviews, and explicitly grants no client
execution authority. It must be supplied with an explicit static client entry; there is no environment override or
installed-client fallback. The original two-argument accepted-client branch remains available only for static builds.

Version2 packets distinguish `OWNED_GENERATION`, `REVIEWED_RELOCATION` and the historical static-only input. External
clients require their exact physical data review and a separate selected-case controller execution review. The private
`--external-case <packet> <fresh-campaign> <case> <nonce> <absolute-execution-review>` entry reuses the complete normal
outer case stage, including the original supervisor exit and subsequent liveness observation. Its admission is limited
to the selected relocated client and physical review, with an exact table of eighteen distinct case/campaign/nonce
identities. This implementation remains subject to final exact review; it grants no execution authority by itself.
The lower-level `--supervisor <packet> <fresh-attempt> <case> <nonce> <absolute-execution-review>` entry does not replace
that outer case stage. Changing only a manifest cannot rebind a bundle: its Prisma import externalizes the absolute
selected physical entry, so changing that entry requires a fresh bundle and exact review.

Normal test preparation still generates with the pinned offline CLI/engine/schema/formatter/protected-input guards.
It preserves all original generation outputs and exclusively materializes a separate byte-exact runtime copy beneath
an owned env-root. Nesting is derived from the actual generated relative env paths. Successful materialization is
required before client readiness; it does not confer independent external-client acceptance. This normal branch retains
its existing test execution policy only after its generation/materialization provenance and physical checks succeed.

The inert binding helper validates the supported generated Node/library text format, all27 output bytes/modes,
schema/provenance and directory identity/ownership. It proves env target containment before candidate metadata access,
then checks absence with lstat, including links. It never reads or hashes env contents. The supervisor checks before
attempt/setup admission and immediately before owner launch; both owners check before and after their source-stage
import and before final reporting. The adjacent generated schema must remain present to exclude dirname fallback.
These repeated checks operate within an owned-root threat model; they do not establish an OS sandbox or eliminate all
same-user filesystem races. Failure retains its original consumed receipts/partial outputs and grants no retry.

The original31 physical client remains blocked for execution because its generated env lookup can reach an ambient
repository env file, even with an explicit database URL. Its historical static acceptance and packets remain unchanged.
The separately copied27 tree has independent physical DATA acceptance: its complete file membership, byte hashes,
metadata, schema provenance and contained absent env targets were checked. The separate resolution diagnostic also
verified the original raw client identity without a database query. Neither result authorizes a source campaign or
establishes provider qualification. The public database proxy need not satisfy the raw constructor's `instanceof`
test; the diagnostic checks its actual raw target and original constructor/prototype instead.

Each external-client campaign requires separately reviewed exact tooling, input and execution authority. At the historical physical-client implementation boundary, all 18 normal source cases and two additive IPC fault cases were unrun. Those predecessor packets and their scope remain historical; all 20 selectors now have accepted actual results as described above. Later fixture changes still require affected source, controller, projection and execution review. Inert tests and static bundling establish no client, native or provider qualification.

The installed-runtime D0 diagnostic established actual independent native and same-library Prisma writer exclusion during original CAS, callback-return and first-barrier windows, plus committed resolver visibility and guarded client lifetime. Its opposite-order parent rejection remained P1008/UNKNOWN with the actual owner retained; it was not SQLite BUSY proof or engine-quiescence evidence. That diagnostic accepted the mechanism for implementation, not an original source proof or the complete feature.

### Separate source IPC fault fixtures

The additive `buildSourceIpcFaultPacket(directory, staticClient, physicalReview)` API requires an explicit reviewed
physical client and never generates one. Its packet admits only `ipc-cleanup-ready` and `ipc-reserve-controlled`;
the normal18 registry and normal controller reject this packet policy. The separate controller interface is
`node <packet>/source-custody-fault-controller.mjs --fault-case <packet> <fresh-campaign> <selector> <nonce>
<absolute-execution-review>`. This is an interface description, not execution authority. An independent
`EXACT_SOURCE_IPC_FAULT16P_CONTROLLER_AND_INPUTS` ACCEPT must bind the fresh manifest, selected fault cases and explicit
fault/controller execution authorization, in addition to the unchanged physical-client checks.

The cleanup fault retains genuine fulfilled `WARMUP_READY` before any cleanup is queued. The reserve fault retains
the genuine filled reserve root and already armed controlled callback chain; the existing callback hook disconnects
the original private channel before its admitted product work resumes. Four observer cells and the local gate are
reserved while ACTIVE. Original eager promises keep their identity; raw Prisma promises gain no consumer. Passive
wrappers continue forwarding original receivers, arguments and results after failure. A preregistered disconnect
listener releases only the inert fixture gate after matching exclusive durable first-failure evidence. The next
fixture guard stops normal continuation; cleanup, hold release, reporting, ACK and terminal handoff stay forbidden.

For these two selectors only, the failure adapter writes the canonical exclusive receipt and then throws a fixed
reporting error. Tests separately exercise tiny capture-cap exhaustion using inert objects; the actual fault cases
retain the normal capacities. Fixed fault observations distinguish post-failure raw forwarding, callback fulfillment
and controlled-throw suppression from fixture continuation. Missing, duplicate, stale or mismatched evidence refuses
completion and preserves the original owner. The supervisor publishes a distinct retained-fault result after actual
owner disconnect; point liveness is checked only after actual supervisor exit. This proves neither engine quiescence
nor permanently live ownership. The historical first normal packet completed three cases before source-happy failed and retained its original owner; its unrun normal/fault allocations were not reused after source changes. Fresh reviewed successors completed the remaining normal and both fault selectors. Independent source20 result review accepted all 18 normal and two fault results with branch-bounded applicability across their frozen packet generations. Failed source-happy and journal-binding predecessors remain consumed and retained. Original31 bundles remain static-only and blocked for execution; acceptance belongs only to the exact reviewed safe physical-client artifacts and actual runs.

The accepted source results cover original positive release, late mutation/destruction races, async lifecycle and bounds, and legacy/disposed replay. The fresh 17-case service/crash matrix also has independent actual-result acceptance. The earlier scaffold synchronization and seven product cases have accepted results. Scaffold synchronization must be renewed after the later browser dependency repairs and final build outputs. The fresh composed NONSTART follow-up integration has original-main exit zero and independent result acceptance, and the current browser/type/export repair passed full application BUILD16. Independent exact source review accepted the 20-file repair. The later current-owner applicability renewal also has bounded independent acceptance by static equivalence, including historical metadata limits; it emits no fresh bundle or runtime observation. Final template propagation and integrated artifact binding remain separate acceptance items. Historical composition failures include a missing sibling bundle, stale caller lineage and an incorrect control-intent retirement oracle. The latter two corrections and fixed successor physical-file metadata were independently reviewed and committed without overwriting historical descriptors or relaxing identity equality. The accepted fresh composition covers original NONSTART to authored A, a saved human answer and fresh B; B remains physically UNKNOWN, canonically ACKNOWLEDGED and slot-occupying. Their original owners remain retained, and neither failure invalidates the accepted source20 or service17 results. Offline fixture success does not authorize provider launches, authentication, inference, native qualification or releases. Preserve historical UNKNOWN outcomes, consumed allocations and original crash databases/journals.
