# R33 process-state observation

This additive source copies the frozen owned-host observer and its result-classification header. The only new output is `processState` on records returned by the existing `identity(pid)` and `directChildMetadata(parentPid, childPid)` methods. `MakeIdentity` projects `proc_bsdinfo.pbi_status` from the `PROC_PIDTBSDINFO` calls already present; no OS query or API export is added. The same three exports remain, and initialization performs no process inspection.

The closed labels use the local SDK's `<sys/proc.h>` constants:

| SDK status       | Label      | Meaning                                  |
| ---------------- | ---------- | ---------------------------------------- |
| `SRUN`           | `RUNNABLE` | Runnable; does not measure CPU activity. |
| `SSLEEP`         | `SLEEPING` | Sleeping on an address.                  |
| `SSTOP`          | `STOPPED`  | Debugging or suspension state.           |
| `SZOMB`          | `ZOMBIE`   | Awaiting collection by its parent.       |
| Any other status | `OTHER`    | No further interpretation.               |

State is diagnostic only. A zombie remains PRESENT under the unchanged identity classifier. No absence, birth identity, parent/path correlation, poll limit, host completion or cleanup predicate uses process state. Existing ESRCH/short-read handling, bounded direct-child enumeration, path reads and identity rechecks are unchanged. State may change between existing calls; the observation is neither atomic process-state attestation nor native-cause evidence.

Build once into the new private directory with the pinned Node headers and the predecessor's warning flags. The explicit SDK path binds the recorded header bytes:

```sh
umask 0177
/usr/bin/clang++ -std=c++17 -fPIC -shared -undefined dynamic_lookup -Wall -Wextra -Werror \
  -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk \
  -I /opt/homebrew/Cellar/node/26.11.0/include/node \
  scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer-r33/mac-owned-host.cc \
  -o .appraisejs/m02-owned-host-observer-build-r33-01/mac-owned-host.node
```

The build directory must be newly created with mode0700 and the output retained with mode0600. If it exists, stop instead of overwriting. The exclusive `source-pin.json` receipt records source/header/output and selected Node/SDK header hashes plus the exact command. Compilation checks `-Wall -Wextra -Werror`; no test, addon load, exported API call, native Codex start, socket, provider, process metadata probe, authentication or cleanup is part of this build. Source, compiler success and file hashes do not qualify runtime compatibility, containment, native process state or cause.
