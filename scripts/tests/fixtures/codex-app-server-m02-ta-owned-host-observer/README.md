# M02 owned Code Mode host observer (offline preparation)

This fixture is an inert supervisor component for a later reviewed T2 command. `observer.mjs`
starts through a trusted `spawnOwnedCodex` port, binds the returned live `ChildProcess`, and
exposes no public method that accepts a PID. The port must return `{ child, stopOwned }`, where
`stopOwned` requests stop of that same owned Codex child. The supervisor must call
`assertLiveHostBeforeCaseComplete()` after the scripted case reaches its terminal state, then
`stopAndVerify()` before advancing. The latter always requests owned cleanup but qualifies it
only after the live-host completion check and owned Codex `exit` **and** `close` are observed.
Post-spawn binding failures also request owned cleanup and wait for those two events within a
fixed poll bound. Ambiguous cleanup returns an `UNKNOWN` error with `cleanupKnown: false`; no
caller should treat it as no effect. An observation failure fences the case; it is not a
negative host finding. The observer itself never signals a process.
The trusted spawn port must either return its owned handle and stop callback after a child
starts, or perform its own cleanup before rejecting; a rejected promise cannot be rebound to
an unseen child by this observer.

The native addon provides only `identity(pid)`, `listDirectChildren(parentPid)`, and
`directChildMetadata(parentPid, childPid)` to the trusted wrapper. The wrapper pins the parent
birth identity to its live child handle, enumerates at most 15 direct children, checks each
listed child's current parent and birth identity, and checks the parent identity again. It
uses the libproc contract where `proc_listchildpids` receives buffer bytes but returns a PID
count, as shown in [Apple's libproc implementation](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.c).
It records only the single observed host identity. After owned stop it re-reads only that
previously observed host PID's birth identity; a reused PID proves the original identity is
gone, without reading the replacement's path or signalling it. Unknown direct children fail
closed. The exact scoped MCP child executable path must be supplied as the sole reviewed
`allowedDirectChildPaths` entry by the later T2 composition. No path allowlist is inferred.

`verifyPinnedHostBinary()` separately reads the exact pinned Code Mode host file through a
no-follow descriptor, checks its inode/owner/mode and SHA-256, and returns a pin receipt. This
checks file bytes at preparation time; it does not attest the process image, executable
provenance, security isolation, or an exact spawn count. Polling can miss short-lived children.
The direct-child APIs have a PID reuse race between OS calls; identity checks detect observed
changes but cannot make the OS snapshot atomic. Any such ambiguity fails the case.
`proc_pidinfo` absence is accepted only when it returns zero with `ESRCH`; a short response or
zero without `ESRCH` is uncertain. The pure C++ result classifier has a standalone selftest.

Offline deterministic build on the pinned Node 26 host:

```sh
clang++ -std=c++17 -fPIC -shared -undefined dynamic_lookup -Wall -Wextra -Werror \
  -I /opt/homebrew/Cellar/node/26.11.0/include/node \
  scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer/mac-owned-host.cc \
  -o .appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node
```

This build does not call the addon APIs. A separate inert load check may inspect its exports.
The pure classifier can be checked offline with:

```sh
clang++ -std=c++17 -Wall -Wextra -Werror \
  scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer/proc-result-classification.test.cc \
  -o .appraisejs/m02-owned-host-observer-build-01/proc-result-classification.test
.appraisejs/m02-owned-host-observer-build-01/proc-result-classification.test
```

No native Codex start, socket, provider, process metadata query, auth, inference, or grant is
part of this fixture's offline tests. The later exact T2 source/manifest review must pin the
addon build hash, host pin, MCP path, source, tests, and command before native use.
