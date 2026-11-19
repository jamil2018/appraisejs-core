#include <node_api.h>

#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <limits.h>
#include <new>
#include <stdint.h>
#include <string.h>
#include <sys/event.h>
#include <sys/proc_info.h>
#include <unistd.h>

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
      !SetNumber(env, object, "birthUsec", info.pbi_start_tvusec))
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

struct DirectForkWatch {
  int fd;
  int pid;
};

void CloseForkWatch(DirectForkWatch* watch) {
  if (watch->fd < 0) return;
  close(watch->fd);
  watch->fd = -1;
}

void FinalizeForkWatch(napi_env, void* data, void*) {
  auto* watch = static_cast<DirectForkWatch*>(data);
  CloseForkWatch(watch);
  delete watch;
}

DirectForkWatch* UnwrapForkWatch(napi_env env, napi_callback_info callback) {
  size_t count = 0;
  napi_value receiver;
  void* data = nullptr;
  if (napi_get_cb_info(env, callback, &count, nullptr, &receiver, nullptr) != napi_ok ||
      napi_unwrap(env, receiver, &data) != napi_ok)
    return nullptr;
  return static_cast<DirectForkWatch*>(data);
}

napi_value StopForkWatch(napi_env env, napi_callback_info callback) {
  auto* watch = UnwrapForkWatch(env, callback);
  if (!watch) return Fail(env, "original process watch required");
  CloseForkWatch(watch);
  napi_value result;
  return napi_get_undefined(env, &result) == napi_ok ? result : nullptr;
}

napi_value ObserveForkWatchExit(napi_env env, napi_callback_info callback) {
  auto* watch = UnwrapForkWatch(env, callback);
  if (!watch) return Fail(env, "original process watch required");
  const char* evidence = "EXIT_UNPROVEN";
  if (watch->fd >= 0) {
    struct kevent event;
    const struct timespec nonblocking = {0, 0};
    const int found = kevent(watch->fd, nullptr, 0, &event, 1, &nonblocking);
    if (found == 1 && event.ident == static_cast<uintptr_t>(watch->pid) &&
        event.filter == EVFILT_PROC && (event.flags & EV_ERROR) == 0) {
      // A coalesced NOTE_FORK defeats even an otherwise valid terminal note.
      if ((event.fflags & NOTE_FORK) != 0) evidence = "FORK_OBSERVED";
      else if ((event.flags & EV_EOF) != 0 && event.fflags == NOTE_EXIT) evidence = "EXIT_NO_FORK";
    }
    CloseForkWatch(watch);
  }
  napi_value result;
  return napi_create_string_utf8(env, evidence, NAPI_AUTO_LENGTH, &result) == napi_ok ? result : nullptr;
}

napi_value WatchDirectForks(napi_env env, napi_callback_info callback) {
  int pid;
  if (!GetOnePidArg(env, callback, &pid)) return Fail(env, "positive original process PID required");
  proc_bsdinfo before, after;
  if (ReadIdentity(pid, &before) != ProcIdentityResult::kPresent)
    return Fail(env, "original process watch identity unavailable");
  const int fd = kqueue();
  if (fd < 0) return Fail(env, "original process watch unavailable");
  struct kevent registration;
  EV_SET(&registration, pid, EVFILT_PROC, EV_ADD | EV_ENABLE | EV_CLEAR, NOTE_FORK | NOTE_EXIT, 0, nullptr);
  if (fcntl(fd, F_SETFD, FD_CLOEXEC) == -1 || kevent(fd, &registration, 1, nullptr, 0, nullptr) != 0 ||
      ReadIdentity(pid, &after) != ProcIdentityResult::kPresent || !SameBirth(before, after) ||
      before.pbi_ppid != after.pbi_ppid) {
    close(fd);
    return Fail(env, "original process watch registration uncertain");
  }
  napi_value result;
  const napi_property_descriptor methods[] = {
      {"observeExit", nullptr, ObserveForkWatchExit, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"close", nullptr, StopForkWatch, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  auto* watch = new (std::nothrow) DirectForkWatch{fd, pid};
  if (!watch) {
    close(fd);
    return Fail(env, "could not allocate original process watch");
  }
  if (napi_create_object(env, &result) != napi_ok ||
      napi_define_properties(env, result, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok ||
      napi_wrap(env, result, watch, FinalizeForkWatch, nullptr, nullptr) != napi_ok) {
    FinalizeForkWatch(env, watch, nullptr);
    return Fail(env, "could not bind original process watch");
  }
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
      {"identity", nullptr, Identity, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"listDirectChildren", nullptr, ListDirectChildren, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"directChildMetadata", nullptr, DirectChildMetadata, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"watchDirectForks", nullptr, WatchDirectForks, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok)
    return Fail(env, "could not initialize metadata API");
  return exports;
}
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
