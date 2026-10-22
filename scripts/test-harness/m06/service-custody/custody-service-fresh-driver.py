"""Exact-reviewed fresh SERVICE OS-parent driver. Import is inert; CLI requires operations ACCEPT."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import stat
import shutil
import sys
import threading

RETAINED_DRIVERS = []
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
LEGACY = {"legacy-fs-valid-fresh-refusal", "legacy-fs-disposed-fresh-refusal", "legacy-fs-sealed-corrupt-fresh-refusal", "legacy-committed-clean-replay"}
RETAINED = {"activation-unknown", "controlled-commit-rollback", "old-commit-other-key-retirement", "unrelated-pre-sql-retirement", "retired-release-sync-cleanup-throw"}
CRASHES = {"pending-death", "pre-receipt-death", "before-commit-death", "around-commit-death", "after-commit-death"}
REMAINING = ["activation-unknown", "late-ack", "controlled-commit-rollback", "pending-death", "pre-receipt-death", "before-commit-death", "around-commit-death", "after-commit-death", "legacy-fs-valid-fresh-refusal", "legacy-fs-disposed-fresh-refusal", "legacy-fs-sealed-corrupt-fresh-refusal", "legacy-committed-clean-replay", "disposed-original-after-writer-close", "wrong-original-client", "old-commit-other-key-retirement", "unrelated-pre-sql-retirement", "retired-release-sync-cleanup-throw"]


def digest(filename):
    return hashlib.sha256(Path(filename).read_bytes()).hexdigest()


def write_exclusive(filename, value):
    with Path(filename).open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def read_bounded_record(filename, maximum, optional=False):
    try:
        descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        if optional:
            return None
        raise
    try:
        before = os.fstat(descriptor)
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= maximum
        data = os.read(descriptor, maximum + 1)
        assert len(data) == before.st_size and len(data) <= maximum
        after = os.fstat(descriptor)
        assert after.st_size == before.st_size and after.st_mtime_ns == before.st_mtime_ns
        return json.loads(data)
    finally:
        os.close(descriptor)


def validate_owner_evidence(proposal, supervisor_pid, owner, read_record=read_bounded_record, selected=REMAINING):
    assert set(owner) == {"case", "workspace", "pid", "nonce", "disposition", "terminalType", "assertionsPassed"}
    assert owner["case"] in selected and owner["assertionsPassed"] is True
    assert type(owner["pid"]) is int and owner["pid"] > 0
    assert UUID.fullmatch(owner["nonce"])
    workspace = Path(owner["workspace"])
    cases = Path(proposal["environment"]["CUSTODY_SERVICE_EVIDENCE"])
    assert workspace.parent == cases and workspace.name.startswith(owner["case"] + "-")
    script = proposal["legacyBundle"] if owner["case"] in LEGACY else proposal["ownerBundle"]
    expected_argv = [proposal["argv"][0], script, owner["case"], str(workspace), proposal["nativeScript"], owner["nonce"]]
    for argument in expected_argv:
        assert isinstance(argument, str) and argument.isascii() and not any(char in argument for char in "\x00\n\r\t")
    identity = read_record(workspace / "owner-identity.json", 32768)
    assert set(identity) == {"version", "type", "parentPid", "case", "workspace", "nativeScript", "nonce", "executable", "script", "cwd", "environment", "expectedArgv", "pid", "actualSpawnargs"}
    assert identity == {"version": 1, "type": "service-owner-preowned-identity", "parentPid": supervisor_pid,
        "case": owner["case"], "workspace": str(workspace), "nativeScript": proposal["nativeScript"], "nonce": owner["nonce"],
        "executable": proposal["argv"][0], "script": script, "cwd": proposal["cwd"],
        "environment": {"PATH": proposal["environment"]["PATH"], "DATABASE_URL": "file:" + str(workspace / "canonical.db")},
        "expectedArgv": expected_argv, "pid": owner["pid"], "actualSpawnargs": expected_argv}
    if owner["case"] in CRASHES:
        assert owner["terminalType"] is None and owner["disposition"] == "EXACT_CRASH_KNOWN_EXIT"
        return None
    if owner["case"] not in RETAINED:
        assert owner["terminalType"] == "case-known-closed" and owner["disposition"] == "AUTHENTICATED_TERMINAL"
        return None
    assert owner["terminalType"] == "case-retained" and owner["disposition"] == "AUTHENTICATED_TERMINAL"
    assert read_record(workspace / "owner-failure-latch.json", 16384, True) is None
    terminal = read_record(workspace / "retained-owner.json", 131072)
    assert terminal["terminalState"] == "POINT_IN_TIME_CALLBACK_COMMIT_WITH_DISCONNECT_EXTERNAL_LIVENESS_UNVERIFIED"
    for field in ["case", "pid", "nonce"]:
        assert terminal[field] == owner[field]
    assert terminal["type"] == "case-retained" and type(terminal["sequence"]) is int and terminal["sequence"] > 0
    assert re.fullmatch(r"[0-9a-f]{64}", terminal["expectedFixtureSha256"])
    handoff = terminal["handoff"]
    assert set(handoff) == {"case", "expectedFixtureSha256", "nonce", "pid", "sequence", "terminalSequence", "terminalType", "type"}
    assert handoff["type"] == "terminal-handoff" and handoff["terminalType"] == "case-retained"
    assert handoff["terminalSequence"] == terminal["sequence"]
    assert type(handoff["sequence"]) is int and handoff["sequence"] > terminal["sequence"]
    for field in ["case", "pid", "nonce", "expectedFixtureSha256"]:
        assert handoff[field] == terminal[field]
    commit = read_record(workspace / "owner-terminal-callback-commit.json", 4096)
    assert set(commit) == {"case", "expectedFixtureSha256", "handoffSequence", "nonce", "ownerScript", "phase", "pid", "terminalSequence", "terminalType", "type", "version"}
    assert commit == {"version": 1, "type": "owner-terminal-callback-commit", "case": owner["case"], "pid": owner["pid"],
        "nonce": owner["nonce"], "ownerScript": script, "terminalType": "case-retained", "terminalSequence": terminal["sequence"],
        "handoffSequence": handoff["sequence"], "expectedFixtureSha256": terminal["expectedFixtureSha256"],
        "phase": "OWNER_HANDOFF_SEND_CALLBACK_COMMITTED"}
    assert terminal["callbackCommit"] == commit
    assert read_record(workspace / "owner-failure-latch.json", 16384, True) is None
    return expected_argv


def validate_ps_command(result, expected_argv):
    assert result.returncode == 0 and result.stderr == b""
    assert isinstance(result.stdout, bytes) and result.stdout.endswith(b"\n")
    assert result.stdout[:-1] == " ".join(expected_argv).encode("ascii")


class OriginalEffects:
    popen = staticmethod(subprocess.Popen)
    open_log = staticmethod(lambda filename: Path(filename).open("xb"))
    write = staticmethod(write_exclusive)
    read = staticmethod(read_bounded_record)
    ps = staticmethod(lambda argv: subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False))

    @staticmethod
    def park(record):
        while True:
            threading.Event().wait()


def retain_driver_failure(record, error, attempt, effects):
    if not record["failed"]:
        record["failed"] = True
        record["firstError"] = error
    try:
        effects.write(attempt / "driver-unknown.json", {"status": "UNKNOWN_ORIGINAL_PARENT_AND_RESOURCES_RETAINED", "message": str(record["firstError"]), "actualSupervisorExitKnown": record["waitReturned"], "providerQualified": False, "runtimeQualified": False})
    except BaseException as report_error:
        record["reportError"] = report_error
    effects.park(record)
    return record  # Inert fake park only; OriginalEffects.park never returns.


def supervise_original_controller(proposal, effects=OriginalEffects, selected=REMAINING):
    attempt = Path(proposal["attemptDirectory"])
    record = {"child": None, "stdout": None, "stderr": None, "pid": None, "failed": False, "firstError": None,
        "reportError": None, "waitReturned": False, "returncode": None, "argv": proposal["argv"], "observations": []}
    RETAINED_DRIVERS.append(record)
    try:
        record["stdout"] = effects.open_log(attempt / "controller.stdout")
        record["stderr"] = effects.open_log(attempt / "controller.stderr")
        # The original Popen return is installed directly in its preallocated slot before PID/report/log access.
        record["child"] = effects.popen(proposal["argv"], cwd=proposal["cwd"], env=proposal["environment"], stdout=record["stdout"], stderr=record["stderr"])
        record["pid"] = record["child"].pid
        record["actualArgv"] = record["child"].args
        assert record["actualArgv"] == proposal["argv"]
        assert type(record["pid"]) is int and record["pid"] > 0
        effects.write(Path(proposal["environment"]["CUSTODY_SERVICE_PARENT_IDENTITY"]), {"version": 1,
            "type": "service-os-parent-identity", "pid": record["pid"], "argv": record["actualArgv"],
            "executable": proposal["argv"][0], "cwd": proposal["cwd"],
            "identityFilename": proposal["environment"]["CUSTODY_SERVICE_PARENT_IDENTITY"]})
        record["returncode"] = record["child"].wait()
        record["waitReturned"] = True
        effects.write(attempt / "controller-exit.json", {"pid": record["pid"], "argv": record["argv"], "returncode": record["returncode"], "actualOriginalOsParentExited": True})
        assert type(record["returncode"]) is int and record["returncode"] == 0
        summary = effects.read(attempt / "supervisor-result.json", 131072)
        assert set(summary) == {"version", "type", "pid", "cases", "owners", "runtimeQualified", "providerQualified"}
        assert summary["version"] == 1 and summary["type"] == "service-main-controller-success" and summary["pid"] == record["pid"]
        assert summary["cases"] == selected and [owner["case"] for owner in summary["owners"]] == selected
        assert summary["runtimeQualified"] is False and summary["providerQualified"] is False
        assert effects.read(attempt / "supervisor-failure.json", 16384, True) is None
        observed = set()
        for owner in summary["owners"]:
            expected = validate_owner_evidence(proposal, record["pid"], owner, effects.read, selected)
            if expected is None:
                continue
            assert owner["pid"] not in observed
            observed.add(owner["pid"])
            result = effects.ps(["/bin/ps", "-p", str(owner["pid"]), "-o", "command="])
            validate_ps_command(result, expected)
            assert effects.read(Path(owner["workspace"]) / "owner-failure-latch.json", 16384, True) is None
            record["observations"].append({"pid": owner["pid"], "case": owner["case"], "nonce": owner["nonce"], "status": "POINT_IN_TIME_ORIGINAL_OWNER_OBSERVED_AFTER_ACTUAL_SUPERVISOR_EXIT"})
        effects.write(attempt / "post-supervisor-owner-observations.json", {"observations": record["observations"], "actualOriginalOsParentExit": record["returncode"], "providerQualified": False, "runtimeQualified": False})
        return record
    except BaseException as error:
        return retain_driver_failure(record, error, attempt, effects)


STARTUP_FLAGS = {
    "optimize": 0, "isolated": 1, "no_site": 1, "dont_write_bytecode": 1,
    "ignore_environment": 1, "no_user_site": 1, "safe_path": True,
}
SERVICE_ROOT = Path(__file__).resolve().parents[4]
C_RELATIVE = ".tmp/m06-source8-template-dependencies1/env-root/a/b/c/d/e/client/index.js"
TOOL_ROLES = {"node", "pythonLauncher", "pythonRuntime", "ps", "git", "esbuild"}


def require_admission(condition, reason):
    if not condition:
        raise ValueError(reason)


def unique_admission_object(pairs):
    value = {}
    for key, item in pairs:
        require_admission(key not in value, "DUPLICATE_JSON_FIELD")
        value[key] = item
    return value


def admission_json(filename):
    return json.loads(Path(filename).read_bytes(), object_pairs_hook=unique_admission_object)


def ordinary_admission_file(filename):
    filename = Path(filename)
    require_admission(filename.is_absolute() and filename.resolve(strict=True) == filename, "NONPHYSICAL_INPUT")
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        require_admission(stat.S_ISREG(before.st_mode) and before.st_nlink >= 1, "NONORDINARY_INPUT")
        digest_value = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest_value.update(chunk)
        after = os.fstat(descriptor)
        require_admission((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_nlink) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_nlink), "INPUT_CHANGED_DURING_READ")
        return {"filename": str(filename), "bytes": before.st_size, "sha256": digest_value.hexdigest(),
            "mode": stat.S_IMODE(before.st_mode), "uid": before.st_uid, "device": before.st_dev, "inode": before.st_ino}
    finally:
        os.close(descriptor)


def admission_directory(filename):
    filename = Path(filename)
    info = filename.lstat()
    require_admission(filename.is_absolute() and filename.resolve(strict=True) == filename and stat.S_ISDIR(info.st_mode), "NONPHYSICAL_DIRECTORY")
    return {"filename": str(filename), "mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid,
        "device": info.st_dev, "inode": info.st_ino}


def admission_inventory(directory):
    # Names and metadata only. Unexpected env files are refused before any file bytes are read.
    names = []
    for root, directories, files in os.walk(directory, followlinks=False):
        for name in directories:
            require_admission(not Path(root, name).is_symlink(), "C_DIRECTORY_SYMLINK")
        names.extend(str(Path(root, name)) for name in files)
    return sorted(names)


class AdmissionEffects:
    read = staticmethod(admission_json)
    file = staticmethod(ordinary_admission_file)
    directory = staticmethod(admission_directory)
    inventory = staticmethod(admission_inventory)
    resolve = staticmethod(lambda filename: str(Path(filename).resolve(strict=True)))
    lexists = staticmethod(os.path.lexists)
    which = staticmethod(lambda command, search_path: shutil.which(command, path=search_path))

    @staticmethod
    def context():
        return {"argv": list(sys.argv), "runtimeArgv": list(sys.orig_argv),
            "executable": str(Path(sys.executable).resolve()), "pythonVersion": sys.version,
            "cwd": os.getcwd(), "environment": dict(os.environ), "debug": __debug__,
            "flags": {key: getattr(sys.flags, key) for key in STARTUP_FLAGS},
            "platform": sys.platform, "machine": os.uname().machine}

    @staticmethod
    def allocate(proposal, review):
        allocate_service_attempt(proposal, review)


def verify_admission_record(record, effects):
    require_admission(set(record) == {"filename", "bytes", "sha256"}, "INPUT_RECORD_FIELDS")
    name = Path(record["filename"]).name
    require_admission(not name.startswith(".env") and name not in {".npmrc", ".netrc"}, "ENV_CONTENT_READ_FORBIDDEN")
    actual = effects.file(record["filename"])
    require_admission(all(actual[key] == record[key] for key in record), "INPUT_BINDING_CHANGED")


def verify_driver_startup(proposal, packet, review_filename, driver_filename, effects):
    invocation = proposal["driverInvocation"]
    require_admission(set(invocation) == {"argv", "runtimeArgv", "cwd", "environment"}, "DRIVER_INVOCATION_FIELDS")
    startup = proposal["driverStartup"]
    require_admission(set(startup) == {"executable", "pythonVersion", "debug", "flags", "platform", "machine"}, "DRIVER_STARTUP_FIELDS")
    require_admission(startup["debug"] is True and startup["flags"] == STARTUP_FLAGS, "UNSAFE_PYTHON_STARTUP")
    require_admission(startup["platform"] == "darwin" and startup["machine"] == "arm64", "UNEXPECTED_PLATFORM")
    tools = proposal["executableTools"]
    suffix = ["-I", "-S", "-B", str(driver_filename), str(packet), str(review_filename)]
    require_admission(invocation["argv"] == [tools["pythonLauncher"]["filename"], *suffix], "DRIVER_LAUNCH_VECTOR")
    require_admission(invocation["runtimeArgv"] == [tools["pythonRuntime"]["filename"], *suffix], "DRIVER_RUNTIME_VECTOR")
    require_admission(invocation["cwd"] == proposal["cwd"] == str(SERVICE_ROOT), "DRIVER_CWD_BINDING")
    require_admission(startup["executable"] == tools["pythonLauncher"]["filename"], "PYTHON_LAUNCHER_BINDING")
    context = effects.context()
    expected = {**startup, "argv": suffix[3:], "runtimeArgv": invocation["runtimeArgv"],
        "cwd": invocation["cwd"], "environment": invocation["environment"]}
    require_admission(context == expected, "DRIVER_EFFECTIVE_CONTEXT_MISMATCH")
    require_admission(set(invocation["environment"]) == {"PATH", "HOME", "TMPDIR", "NODE_ENV", "NO_COLOR", "LC_CTYPE", "__CF_USER_TEXT_ENCODING"}, "DRIVER_ENV_FIELDS")
    require_admission(invocation["environment"]["PATH"] == proposal["environment"]["PATH"], "TOOL_PATH_ENVIRONMENT")
    require_admission(invocation["environment"]["LC_CTYPE"] == "C.UTF-8" and
        invocation["environment"]["__CF_USER_TEXT_ENCODING"] == "0x1F7:0x0:0x0", "PINNED_MAC_STARTUP_ENV")


def verify_executable_tools(proposal, inputs, effects):
    tools = proposal["executableTools"]
    require_admission(set(tools) == TOOL_ROLES, "EXECUTABLE_ROLE_SET")
    require_admission(tools["node"]["filename"] == proposal["nodeExecutable"] == proposal["argv"][0], "NODE_TOOL_BINDING")
    require_admission(tools["ps"]["filename"] == "/bin/ps", "PS_TOOL_BINDING")
    indexed = {item["filename"]: item for item in inputs}
    for record in tools.values():
        require_admission(set(record) == {"filename", "bytes", "sha256", "mode", "uid", "device", "inode"}, "TOOL_RECORD_FIELDS")
        require_admission(effects.file(record["filename"]) == record and record["mode"] & 0o111 != 0, "EXECUTABLE_TOOL_CHANGED")
        require_admission(indexed.get(record["filename"]) == {key: record[key] for key in ["filename", "bytes", "sha256"]}, "UNLISTED_EXECUTABLE_TOOL")
    resolution = proposal["toolResolution"]
    require_admission(set(resolution) == {"gitInvocation", "esbuildInvocation", "esbuildPackageMain", "esbuildPlatformPackage"}, "TOOL_RESOLUTION_FIELDS")
    require_admission(effects.which("git", proposal["environment"]["PATH"]) == resolution["gitInvocation"], "GIT_PATH_SELECTION_CHANGED")
    require_admission(effects.resolve(resolution["gitInvocation"]) == tools["git"]["filename"], "GIT_PHYSICAL_SELECTION_CHANGED")
    module_paths = {
        "esbuildInvocation": SERVICE_ROOT / "node_modules/@esbuild/darwin-arm64/bin/esbuild",
        "esbuildPackageMain": SERVICE_ROOT / "node_modules/esbuild/lib/main.js",
        "esbuildPlatformPackage": SERVICE_ROOT / "node_modules/@esbuild/darwin-arm64/package.json",
    }
    for key, invoked in module_paths.items():
        require_admission(resolution[key]["invokedAs"] == str(invoked), "ESBUILD_FIXED_SELECTION")
        physical = effects.resolve(invoked)
        require_admission(physical == resolution[key]["filename"] and physical in indexed, "ESBUILD_RESOLUTION_CHANGED")
    require_admission(resolution["esbuildInvocation"]["filename"] == tools["esbuild"]["filename"], "ESBUILD_TOOL_BINDING")


def verify_service_absence(proposal, effects):
    env_path = str(SERVICE_ROOT / ".tmp/m06-source8-template-dependencies1/env-root/.env")
    expected = [proposal["attemptDirectory"], str(SERVICE_ROOT / ".env"), str(SERVICE_ROOT / "prisma/dev.db"), env_path]
    require_admission(proposal["requiredAbsenceBeforeAllocation"] == expected, "ABSENCE_CONTRACT_MISMATCH")
    for filename in expected:
        require_admission(not effects.lexists(filename), "REQUIRED_PATH_PRESENT")


def verify_physical_client_admission(proposal, inputs, effects):
    canonical_entry = str(SERVICE_ROOT / C_RELATIVE)
    binding_path = SERVICE_ROOT.parents[1] / "evidence/source-regression8/client-binding16m-physical1/physical-client-binding.json"
    require_admission(proposal["generatedClient"] == canonical_entry, "C_ENTRY_BINDING")
    record = proposal["physicalClientBinding"]
    require_admission(record["filename"] == str(binding_path) and record in inputs, "C_FIXED_BINDING_RECORD")
    verify_admission_record(record, effects)
    facts = effects.read(binding_path)["facts"]
    directory = str(Path(canonical_entry).parent)
    env_root = str(SERVICE_ROOT / ".tmp/m06-source8-template-dependencies1/env-root")
    require_admission((facts["entry"], facts["directory"], facts["envRoot"]) == (canonical_entry, directory, env_root), "C_PHYSICAL_PATHS")
    env_path = str(Path(env_root) / ".env")
    require_admission(facts["relativeEnvPaths"] == {"rootEnvPath": "../../../../../../.env"}, "C_ENV_SHAPE")
    require_admission(len(facts["envTargets"]) == 1 and facts["envTargets"][0]["filename"] == env_path and
        facts["envTargets"][0]["role"] == "rootEnvPath", "C_ENV_TARGET_BINDING")
    verify_service_absence(proposal, effects)
    files = facts["copied"]["files"]
    for item in facts["ownedDirectories"] + facts["copied"]["directories"]:
        require_admission(effects.directory(item["filename"]) == item, "C_DIRECTORY_IDENTITY_CHANGED")
    require_admission(len(files) == 27 and effects.inventory(directory) == sorted(item["filename"] for item in files), "C_DATA27_INVENTORY_CHANGED")
    for item in files:
        relative = Path(item["relativePath"])
        require_admission(not relative.is_absolute() and ".." not in relative.parts and str(Path(directory) / relative) == item["filename"], "C_FILE_PATH_BINDING")
        require_admission(effects.file(item["filename"]) == {key: value for key, value in item.items() if key != "relativePath"}, "C_DATA27_CHANGED")


def allocate_service_attempt(proposal, review):
    attempt = Path(proposal["attemptDirectory"])
    attempt.parent.mkdir(parents=True, exist_ok=True)
    attempt.mkdir()
    write_exclusive(attempt / "allocation.json", {"status": "CONSUMED_NO_RETRY", "manifestSha256": review["manifestSha256"], "proposalSha256": review["proposalSha256"]})
    for name in ["home", "tmp", "cases"]:
        (attempt / name).mkdir()


def verify_operations(packet, review_filename, selected=REMAINING, scope="EXACT_SERVICE_FRESH17_OS_PARENT_AND_INPUTS", driver_filename=__file__, effects=AdmissionEffects):
    require_admission(__debug__, "ASSERTIONS_DISABLED")
    packet, review_filename, driver_filename = Path(packet), Path(review_filename), Path(driver_filename)
    expected_driver = SERVICE_ROOT / "scripts/test-harness/m06/service-custody" / driver_filename.name
    require_admission(driver_filename == expected_driver and effects.resolve(driver_filename) == str(driver_filename), "FIXED_DRIVER_PATH")
    if driver_filename.name == "custody-service-fresh-driver.py":
        require_admission(selected == REMAINING and scope == "EXACT_SERVICE_FRESH17_OS_PARENT_AND_INPUTS", "FIXED_FRESH17_SELECTION")
    else:
        require_admission(driver_filename.name == "custody-service-composition-driver.py" and selected == ["original-nonstart-authored-analysis-composition16z"] and
            scope == "EXACT_SERVICE_COMPOSITION16Z_OS_PARENT_AND_INPUTS", "FIXED_COMPOSITION_SELECTION")
    manifest = effects.read(packet / "manifest.json")
    proposal = effects.read(packet / "invocation-proposal.json")
    review = effects.read(review_filename)
    verify_driver_startup(proposal, packet, review_filename, driver_filename, effects)
    require_admission(review["judgment"] == "ACCEPT" and review["scope"] == scope and review["runtimeAuthorized"] is True, "OPERATIONS_NOT_ACCEPTED")
    require_admission(review["manifestSha256"] == effects.file(packet / "manifest.json")["sha256"] and
        review["proposalSha256"] == effects.file(packet / "invocation-proposal.json")["sha256"], "REVIEW_PACKET_BINDING")
    for field in ["argv", "cwd", "environment", "attemptDirectory", "driverInvocation", "driverStartup", "executableTools", "toolResolution", "physicalClientBinding", "requiredAbsenceBeforeAllocation"]:
        require_admission(review[field] == proposal[field], "REVIEW_INVOCATION_BINDING")
    require_admission(proposal["cases"] == selected and manifest["cases"] == selected, "PACKET_SELECTION")
    artifact_review = effects.read(review["artifactReview"])
    require_admission(effects.file(review["artifactReview"])["sha256"] == review["artifactReviewSha256"] and
        artifact_review["judgment"] == "ACCEPT" and artifact_review["artifactManifestSha256"] == manifest["artifactManifestSha256"], "ARTIFACT_NOT_ACCEPTED")
    verify_executable_tools(proposal, manifest["inputs"], effects)
    verify_physical_client_admission(proposal, manifest["inputs"], effects)
    for item in manifest["inputs"]:
        verify_admission_record(item, effects)
    require_admission(proposal["argv"] == [proposal["nodeExecutable"], proposal["controllerBundle"]], "CONTROLLER_INVOCATION")
    require_admission(proposal["environment"]["CUSTODY_SERVICE_PARENT_IDENTITY"] == str(Path(proposal["attemptDirectory"]) / "supervisor-identity.json"), "PARENT_IDENTITY_PATH")
    verify_service_absence(proposal, effects)  # Recheck after the final ordinary input read, immediately before allocation.
    # No allocation, logging, Popen, environment-content read or resource effects precede this point.
    effects.allocate(proposal, review)
    return proposal


def main():
    require_admission(len(sys.argv) == 3, "DRIVER_ARGUMENT_COUNT")
    proposal = verify_operations(Path(sys.argv[1]), sys.argv[2])
    supervise_original_controller(proposal)


if __name__ == "__main__":
    main()
