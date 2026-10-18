#pragma once

#include <errno.h>

enum class ProcIdentityResult { kPresent, kMissing, kUncertain };

// Pure classification of proc_pidinfo's return; never infer absence from a short/zero read
// unless the OS explicitly reported ESRCH. Used by the addon and an inert standalone selftest.
inline ProcIdentityResult ClassifyProcIdentity(int bytes, int error, bool pidMatches, int expectedBytes) {
  if (bytes == expectedBytes && pidMatches) return ProcIdentityResult::kPresent;
  if (bytes == 0 && error == ESRCH) return ProcIdentityResult::kMissing;
  return ProcIdentityResult::kUncertain;
}
