#include <node_api.h>

#include <errno.h>
#include <libproc.h>
#include <limits.h>
#include <stdint.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/proc.h>

#include "proc-result-classification.h"

// Metadata only. No kill, all-PID enumeration, command-line, environment, or process memory API.
namespace {
constexpr int kMaxDirectChildren = 16;

napi_value Fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

bool GetPid(napi_env env, napi_value value, int* pid) {
  int32_t parsed = 0;
  if (napi_get_value_int32(env, value, &parsed) != napi_ok || parsed <= 0) return false;
  *pid = parsed;
  return true;
}

bool GetOnePidArg(napi_env env, napi_callback_info info, int* pid) {
  size_t count = 1;
  napi_value args[1];
  return napi_get_cb_info(env, info, &count, args, nullptr, nullptr) == napi_ok &&
         count == 1 && GetPid(env, args[0], pid);
}

bool SetNumber(napi_env env, napi_value object, const char* name, double number) {
  napi_value value;
  return napi_create_double(env, number, &value) == napi_ok &&
         napi_set_named_property(env, object, name, value) == napi_ok;
}

bool SetPath(napi_env env, napi_value object, const char* path) {
  napi_value value;
  return napi_create_string_utf8(env, path, NAPI_AUTO_LENGTH, &value) == napi_ok &&
         napi_set_named_property(env, object, "path", value) == napi_ok;
}

// Observation only: SRUN means runnable, not measured CPU activity. SZOMB remains PRESENT.
const char* ProcessState(uint32_t status) {
  switch (status) {
    case SRUN: return "RUNNABLE";
    case SSLEEP: return "SLEEPING";
    case SSTOP: return "STOPPED";
    case SZOMB: return "ZOMBIE";
    default: return "OTHER";
  }
}

bool SetProcessState(napi_env env, napi_value object, uint32_t status) {
  napi_value value;
  return napi_create_string_utf8(env, ProcessState(status), NAPI_AUTO_LENGTH, &value) == napi_ok &&
         napi_set_named_property(env, object, "processState", value) == napi_ok;
}

ProcIdentityResult ReadIdentity(int pid, proc_bsdinfo* info) {
  memset(info, 0, sizeof(*info));
  errno = 0;
  const int bytes = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, sizeof(*info));
  return ClassifyProcIdentity(bytes, errno, info->pbi_pid == static_cast<uint32_t>(pid), sizeof(*info));
}

bool SameBirth(const proc_bsdinfo& first, const proc_bsdinfo& second) {
  return first.pbi_pid == second.pbi_pid &&
         first.pbi_start_tvsec == second.pbi_start_tvsec &&
         first.pbi_start_tvusec == second.pbi_start_tvusec;
}

napi_value MakeIdentity(napi_env env, const proc_bsdinfo& info) {
  napi_value object;
  if (napi_create_object(env, &object) != napi_ok ||
      !SetNumber(env, object, "pid", info.pbi_pid) ||
      !SetNumber(env, object, "ppid", info.pbi_ppid) ||
      !SetNumber(env, object, "birthSec", info.pbi_start_tvsec) ||
      !SetNumber(env, object, "birthUsec", info.pbi_start_tvusec) ||
      !SetProcessState(env, object, info.pbi_status))
    return Fail(env, "could not create process identity");
  return object;
}

napi_value Identity(napi_env env, napi_callback_info callback) {
  int pid;
  if (!GetOnePidArg(env, callback, &pid)) return Fail(env, "positive PID required");
  proc_bsdinfo info;
  const ProcIdentityResult classification = ReadIdentity(pid, &info);
  if (classification == ProcIdentityResult::kMissing) {
    napi_value missing;
    napi_get_null(env, &missing);
    return missing;
  }
  if (classification != ProcIdentityResult::kPresent)
    return Fail(env, "process identity inspection uncertain");
  return MakeIdentity(env, info);
}

napi_value ListDirectChildren(napi_env env, napi_callback_info callback) {
  int parent;
  if (!GetOnePidArg(env, callback, &parent)) return Fail(env, "positive parent PID required");
  // A full buffer is ambiguous; fail closed instead of silently omitting a child.
  pid_t children[kMaxDirectChildren];
  memset(children, 0, sizeof(children));
  errno = 0;
  // libproc converts proc_listpids' byte result to a PID count here. Buffer size is bytes.
  const int count = proc_listchildpids(parent, children, sizeof(children));
  if (count < 0 || count >= kMaxDirectChildren || (count == 0 && errno != 0))
    return Fail(env, "direct child enumeration failed or exceeded bound");
  napi_value result;
  if (napi_create_array_with_length(env, count, &result) != napi_ok)
    return Fail(env, "could not create child list");
  for (int index = 0; index < count; index++) {
    napi_value item;
    if (children[index] <= 0 ||
        napi_create_int32(env, children[index], &item) != napi_ok ||
        napi_set_element(env, result, index, item) != napi_ok)
      return Fail(env, "invalid direct child PID");
  }
  return result;
}

napi_value DirectChildMetadata(napi_env env, napi_callback_info callback) {
  size_t count = 2;
  napi_value args[2];
  int parent, pid;
  if (napi_get_cb_info(env, callback, &count, args, nullptr, nullptr) != napi_ok ||
      count != 2 || !GetPid(env, args[0], &parent) || !GetPid(env, args[1], &pid) || parent == pid)
    return Fail(env, "positive distinct parent and child PIDs required");
  proc_bsdinfo first, second;
  const ProcIdentityResult firstResult = ReadIdentity(pid, &first);
  if (firstResult == ProcIdentityResult::kMissing) {
    napi_value missing;
    napi_get_null(env, &missing);
    return missing;
  }
  if (firstResult != ProcIdentityResult::kPresent)
    return Fail(env, "direct child identity inspection uncertain");
  if (first.pbi_ppid != static_cast<uint32_t>(parent))
    return Fail(env, "listed PID is no longer a direct child");
  char path[PROC_PIDPATHINFO_MAXSIZE];
  memset(path, 0, sizeof(path));
  errno = 0;
  const int length = proc_pidpath(pid, path, sizeof(path));
  if (length <= 0 || length >= static_cast<int>(sizeof(path)))
    return Fail(env, "direct child path inspection failed");
  if (ReadIdentity(pid, &second) != ProcIdentityResult::kPresent || !SameBirth(first, second) ||
      second.pbi_ppid != static_cast<uint32_t>(parent))
    return Fail(env, "direct child identity changed during inspection");
  napi_value result = MakeIdentity(env, second);
  if (result == nullptr || !SetPath(env, result, path))
    return Fail(env, "could not create direct child metadata");
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
      {"identity", nullptr, Identity, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"listDirectChildren", nullptr, ListDirectChildren, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"directChildMetadata", nullptr, DirectChildMetadata, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok)
    return Fail(env, "could not initialize metadata API");
  return exports;
}
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
