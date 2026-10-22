"""Actual driver algorithm with fixed inert effects; no Popen/ps/client/owner is executed."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("service_fresh_driver", Path(__file__).with_name("custody-service-fresh-driver.py"))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
NONCE = "abcdef01-2345-6789-abcd-ef0123456789"


def fixture():
    proposal = {"attemptDirectory": "/inert/fresh-only", "cwd": "/inert/Personal Projects/worktree", "argv": ["/inert/node", "/inert/controller.mjs"],
        "ownerBundle": "/inert/current-owner.mjs", "legacyBundle": "/inert/legacy-owner.mjs", "nativeScript": "/inert/native.mjs",
        "environment": {"PATH": "/inert", "CUSTODY_SERVICE_EVIDENCE": "/inert/fresh-only/cases", "CUSTODY_SERVICE_PARENT_IDENTITY": "/inert/fresh-only/supervisor-identity.json"}}
    records, commands, owners = {}, {}, []
    for index, name in enumerate(driver.REMAINING):
        retained = name in driver.RETAINED
        workspace = "/inert/fresh-only/cases/" + name + "-fresh"
        pid = 400 + index
        owner = {"case": name, "workspace": workspace, "pid": pid, "nonce": NONCE,
            "disposition": "EXACT_CRASH_KNOWN_EXIT" if name in driver.CRASHES else "AUTHENTICATED_TERMINAL", "terminalType": None if name in driver.CRASHES else "case-retained" if retained else "case-known-closed", "assertionsPassed": True}
        owners.append(owner)
        script = proposal["legacyBundle"] if name in driver.LEGACY else proposal["ownerBundle"]
        argv = [proposal["argv"][0], script, name, workspace, proposal["nativeScript"], NONCE]
        identity = {"version": 1, "type": "service-owner-preowned-identity", "parentPid": 123, "case": name, "workspace": workspace,
            "nativeScript": proposal["nativeScript"], "nonce": NONCE, "executable": proposal["argv"][0], "script": script,
            "cwd": proposal["cwd"], "environment": {"PATH": "/inert", "DATABASE_URL": "file:" + workspace + "/canonical.db"},
            "expectedArgv": argv, "pid": pid, "actualSpawnargs": argv}
        records[workspace + "/owner-identity.json"] = identity
        if retained:
            handoff = {"case": name, "pid": pid, "nonce": NONCE, "expectedFixtureSha256": "a" * 64, "type": "terminal-handoff", "terminalType": "case-retained", "terminalSequence": 2, "sequence": 3}
            commit = {"version": 1, "type": "owner-terminal-callback-commit", "case": name, "pid": pid, "nonce": NONCE,
                "ownerScript": script, "terminalType": "case-retained", "terminalSequence": 2, "handoffSequence": 3,
                "expectedFixtureSha256": "a" * 64, "phase": "OWNER_HANDOFF_SEND_CALLBACK_COMMITTED"}
            records[workspace + "/retained-owner.json"] = {"case": name, "pid": pid, "nonce": NONCE, "type": "case-retained", "sequence": 2,
                "expectedFixtureSha256": "a" * 64, "handoff": handoff, "callbackCommit": commit,
                "terminalState": "POINT_IN_TIME_CALLBACK_COMMIT_WITH_DISCONNECT_EXTERNAL_LIVENESS_UNVERIFIED"}
            records[workspace + "/owner-terminal-callback-commit.json"] = commit
            commands[str(pid)] = " ".join(argv).encode("ascii") + b"\n"
    records["/inert/fresh-only/supervisor-result.json"] = {"version": 1, "type": "service-main-controller-success", "pid": 123,
        "cases": driver.REMAINING, "owners": owners, "runtimeQualified": False, "providerQualified": False}
    return proposal, records, commands


class FakeEffects:
    def __init__(self):
        self.proposal, self.records, self.commands = fixture()
        self.calls = []
        self.logs = []
        self.parked = None
        self.wait_called = False
        self.returncode = 0
        effects = self

        class Child:
            @property
            def pid(self):
                assert driver.RETAINED_DRIVERS[-1]["child"] is self
                if getattr(effects, "pid_error", None):
                    raise effects.pid_error
                return 123

            @property
            def args(self):
                assert driver.RETAINED_DRIVERS[-1]["child"] is self
                if getattr(effects, "args_error", None):
                    raise effects.args_error
                return effects.proposal["argv"]

            def wait(self):
                effects.calls.append("wait")
                effects.wait_called = True
                if getattr(effects, "wait_error", None):
                    raise effects.wait_error
                return effects.returncode

        self.child = Child()

    def open_log(self, filename):
        handle = object()
        self.logs.append(handle)
        return handle

    def popen(self, argv, **options):
        self.calls.append(("popen", argv, options))
        assert driver.RETAINED_DRIVERS[-1]["stdout"] is self.logs[0]
        assert driver.RETAINED_DRIVERS[-1]["stderr"] is self.logs[1]
        return self.child

    def write(self, filename, value):
        name = Path(filename).name
        self.calls.append(("write", name, value))
        assert driver.RETAINED_DRIVERS[-1]["child"] is self.child
        if name == "supervisor-identity.json":
            assert value["pid"] == self.child.pid and value["argv"] is self.child.args
            if getattr(self, "publication_error", None):
                raise self.publication_error
        if name == "driver-unknown.json" and getattr(self, "report_error", None):
            raise self.report_error

    def read(self, filename, maximum, optional=False):
        name = str(filename)
        assert name.startswith("/inert/fresh-only/")
        assert not name.endswith((".db", ".db-wal", ".db-shm"))
        self.calls.append(("read", name))
        if optional and name not in self.records:
            return None
        return self.records[name]

    def ps(self, argv):
        assert self.wait_called and driver.RETAINED_DRIVERS[-1]["waitReturned"] is True
        assert argv[0] == "/bin/ps" and argv[1] == "-p" and argv[3:] == ["-o", "command="]
        self.calls.append(("ps", argv))
        return SimpleNamespace(returncode=0, stdout=self.commands[argv[2]], stderr=b"")

    def park(self, record):
        self.parked = record
        self.calls.append("park")


class DriverTests(unittest.TestCase):
    def test_original_capture_precedes_pid_and_publication(self):
        effects = FakeEffects()
        record = driver.supervise_original_controller(effects.proposal, effects)
        self.assertFalse(record["failed"])
        self.assertIs(record["child"], effects.child)
        self.assertIs(record["stdout"], effects.logs[0])
        self.assertEqual(len([call for call in effects.calls if isinstance(call, tuple) and call[0] == "popen"]), 1)
        self.assertEqual(len([call for call in effects.calls if isinstance(call, tuple) and call[0] == "ps"]), len(driver.RETAINED))
        self.assertEqual(record["observations"][0]["status"], "POINT_IN_TIME_ORIGINAL_OWNER_OBSERVED_AFTER_ACTUAL_SUPERVISOR_EXIT")

    def test_getter_or_publication_failure_preserves_original_parent_logs_no_wait_no_ps(self):
        for stage in ["pid_error", "args_error", "publication_error"]:
            effects = FakeEffects()
            cause = RuntimeError(stage)
            setattr(effects, stage, cause)
            effects.report_error = RuntimeError("secondary report")
            record = driver.supervise_original_controller(effects.proposal, effects)
            self.assertIs(record["firstError"], cause)
            self.assertIs(record["child"], effects.child)
            self.assertIs(record["stdout"], effects.logs[0])
            self.assertIs(effects.parked, record)
            self.assertFalse(record["waitReturned"])
            self.assertFalse(effects.wait_called)
            self.assertFalse(any(isinstance(call, tuple) and call[0] == "ps" for call in effects.calls))

    def test_unknown_or_unsuccessful_original_wait_never_admits_ps(self):
        for failed_wait in [True, False]:
            effects = FakeEffects()
            if failed_wait:
                effects.wait_error = RuntimeError("wait unknown")
            else:
                effects.returncode = 1
            record = driver.supervise_original_controller(effects.proposal, effects)
            self.assertTrue(record["failed"])
            self.assertIs(effects.parked, record)
            self.assertFalse(any(isinstance(call, tuple) and call[0] == "ps" for call in effects.calls))

    def test_foreign_current_identity_or_callback_failure_never_admits_ps_or_old_lookup(self):
        for field in ["nonce", "actualSpawnargs", "parentPid"]:
            effects = FakeEffects()
            identity = next(value for key, value in effects.records.items() if key.endswith("owner-identity.json"))
            identity[field] = "foreign"
            record = driver.supervise_original_controller(effects.proposal, effects)
            self.assertTrue(record["failed"])
            self.assertFalse(any(isinstance(call, tuple) and call[0] == "ps" for call in effects.calls))
        effects = FakeEffects()
        effects.records["/inert/fresh-only/cases/activation-unknown-fresh/owner-failure-latch.json"] = {"firstFailure": True}
        record = driver.supervise_original_controller(effects.proposal, effects)
        self.assertTrue(record["failed"])
        self.assertFalse(any(isinstance(call, tuple) and call[0] == "ps" for call in effects.calls))

    def test_exact_ascii_full_command_refuses_suffix_nonce_spaces_substring_and_esrch(self):
        argv = ["/node", "/Personal Projects/owner.mjs", "case", "/workspace", "/native", NONCE]
        command = " ".join(argv).encode("ascii")
        driver.validate_ps_command(SimpleNamespace(returncode=0, stdout=command + b"\n", stderr=b""), argv)
        for bad in [command + b"suffix\n", b"prefix" + command + b"\n", command.replace(b"case", b"other-case") + b"\n", command.replace(b" ", b"  ", 1) + b"\n", command[:-1] + b"f\n", command]:
            with self.assertRaises(AssertionError):
                driver.validate_ps_command(SimpleNamespace(returncode=0, stdout=bad, stderr=b""), argv)
        with self.assertRaises(AssertionError):
            driver.validate_ps_command(SimpleNamespace(returncode=1, stdout=b"", stderr=b""), argv)


class CompositionSelectionTests(unittest.TestCase):
    def test_separate_composition_uses_exact_original_wait_identity_and_no_retained_probe(self):
        effects = FakeEffects()
        name = "original-nonstart-authored-analysis-composition16z"
        self.assertNotIn(name, driver.REMAINING)
        old = effects.records["/inert/fresh-only/supervisor-result.json"]["owners"][0]
        old_workspace = old["workspace"]
        old_identity = effects.records[old_workspace + "/owner-identity.json"]
        owner = dict(old, case=name, workspace="/inert/fresh-only/cases/" + name + "-fresh", terminalType="case-known-closed")
        identity = dict(old_identity, case=name, workspace=owner["workspace"], environment={"PATH": "/inert", "DATABASE_URL": "file:" + owner["workspace"] + "/canonical.db"})
        argv = [effects.proposal["argv"][0], effects.proposal["ownerBundle"], name, owner["workspace"], effects.proposal["nativeScript"], NONCE]
        identity.update(expectedArgv=argv, actualSpawnargs=argv)
        effects.records[owner["workspace"] + "/owner-identity.json"] = identity
        summary = effects.records["/inert/fresh-only/supervisor-result.json"]
        summary.update(cases=[name], owners=[owner])
        record = driver.supervise_original_controller(effects.proposal, effects, selected=[name])
        self.assertFalse(record["failed"])
        self.assertTrue(record["waitReturned"])
        self.assertEqual(record["returncode"], 0)
        self.assertEqual(record["observations"], [])
        self.assertFalse(any(call[0] == "ps" for call in effects.calls))
        with self.assertRaises(AssertionError):
            driver.validate_owner_evidence(effects.proposal, 123, owner, effects.read)


if __name__ == "__main__":
    unittest.main()
