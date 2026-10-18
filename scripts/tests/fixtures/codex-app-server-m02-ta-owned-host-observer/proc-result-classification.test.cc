#include "proc-result-classification.h"

#include <assert.h>
#include <errno.h>

int main() {
  constexpr int kExpected = 64;
  assert(ClassifyProcIdentity(kExpected, 0, true, kExpected) == ProcIdentityResult::kPresent);
  assert(ClassifyProcIdentity(0, ESRCH, false, kExpected) == ProcIdentityResult::kMissing);
  assert(ClassifyProcIdentity(0, 0, false, kExpected) == ProcIdentityResult::kUncertain);
  assert(ClassifyProcIdentity(32, 0, true, kExpected) == ProcIdentityResult::kUncertain);
  assert(ClassifyProcIdentity(kExpected, 0, false, kExpected) == ProcIdentityResult::kUncertain);
  assert(ClassifyProcIdentity(0, EPERM, false, kExpected) == ProcIdentityResult::kUncertain);
  return 0;
}
