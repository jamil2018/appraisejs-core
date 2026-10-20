# M02 N2 boundary options and feasibility disposition

Date: 2026-10-15 (Asia/Dhaka). Current instruction requests M02 implementation to completion.
This additive record carries forward the frozen [M00 contract](m00-host-authority-contract.md),
[accepted N0](m02-b-n0-containment.md) and [N2 scope](m02-b-n2-plan.md). Earlier plans and review
outcomes retain their original bytes. This record neither installs an enforcer nor qualifies one.

## Comparison

| Required property                | OS-enforced worker compartment candidate                                                                             | Native macOS process-policy candidate                                                           | Evidence status                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Exact binary/OS compatibility    | Needs supported guest tuple, executable and policy; a different OS cannot qualify the recorded macOS binary          | Needs reviewed support on exact macOS/build/arm64 tuple                                         | UNKNOWN for both                               |
| Engine state versus tool effects | Separate trusted engine state/provider secrets from untrusted tool execution, or prove inaccessible mounts/channels  | Must prove engine-permitted writes do not give model-callable native tools equivalent privilege | BLOCKED: no effective separation shown         |
| Filesystem/data                  | Deny untrusted repository, SQLite, real home/auth/history and supervisor/evidence mounts; protect symlink/race paths | Effective deny rules and owned paths must survive symlinks, child tools and same-UID access     | UNKNOWN for both                               |
| Exec/children/processes          | Deny arbitrary tools/children and protected-process access; enumerate any trusted helpers                            | Exact process policy must deny unauthorized executable paths/children and other-process state   | UNKNOWN for both                               |
| Network and IPC                  | Broker only scoped MCP and exact provider channel; deny worker general/loopback egress                               | Must distinguish trusted provider endpoint from model-callable arbitrary network                | BLOCKED: broker/enforcement composition absent |
| Ambient tools/config             | No inherited plugin/skill/MCP/config authority; full effective native descriptor inventory                           | Feature flags alone cannot suppress the observed broader Code Mode/collaboration surface        | BLOCKED: complete descriptors absent           |
| Startup and cleanup              | Owned handles, exclusive state, process identity and fenced restart                                                  | Same, including no stored-PID signalling or deleting uncertain history                          | UNKNOWN for actual runtime                     |
| Real credential isolation        | Trusted provider state outside all worker mounts/FDs/channels                                                        | Must independently prove no inherited environment/file/process path to credentials              | UNKNOWN; fake canaries insufficient            |

Neither candidate is selected or supported by the current evidence. Recorded Codex
0.162.0-alpha.17.2, macOS 27.0.1/26A434/arm64 and executable hash remain historical pins, not current
support attestations. N0 inspected only named sanitized records, not a qualified local enforcement
installation. No current source record proves either candidate's effective controls.

## Hard feasibility conditions

An engine may need private state writes to operate. If the model-callable Code Mode/native executor
shares that privilege and can reach those writes or supervisor/provider state, allowing engine
startup does not establish worker confinement. A design must identify an enforceable distinction,
not rely on prompts, trusted-model behavior, approval=never, read-only configuration, an empty public
catalog, absent handlers or a passing in-memory test.

The observed broader `functions.exec`/collaboration names are negative exposure evidence, not proof
that they executed. Conversely, failure to execute them in a synthetic fixture is not an OS denial.
M00 prohibits native tools/direct source/database/credential access and arbitrary networking;
we do not relax that contract to make the recorded CodeModeOnly candidate pass.

## Decision and next boundary

**BLOCKED_FEASIBILITY** for native execution/containment qualification. A bounded implementation
of the isolated MCP registration and trusted descriptor projection is useful and can be checked
offline. It cannot supply missing effective OS observations or an actual supported scoped route.
No M03 sessions/schema or M05 production supervisor is introduced by these source additions.

To clear this decision, identify an exact independently assessable enforcer/build composition and
obtain explicit authority for its implementation and bounded enforcement qualification. If the
recorded candidate cannot meet the frozen boundary, a separate build/scope decision is required;
no alternative model/binary/OS, generic executor bridge or weaker M00 boundary is chosen here.
E0 remains ineligible until a safe composition and a fresh exact execution budget are reviewed.
