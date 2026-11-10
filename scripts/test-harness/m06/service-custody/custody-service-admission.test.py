"""Actual admission with inert reads/context/metadata/allocation only; no driver main or child is run."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import types
import unittest

filename = Path(__file__).with_name("custody-service-fresh-driver.py")
spec = importlib.util.spec_from_file_location("service_admission_inert", filename)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class InertAdmission:
    def __init__(self, composition=False):
        self.calls, self.allocations, self.present, self.links = [], [], set(), set()
        root = driver.SERVICE_ROOT
        self.packet = root.parents[1] / "evidence/inert-service-admission/packet"
        self.review_path = root.parents[1] / "reviews/inert-service-admission.json"
        self.driver_path = filename.with_name("custody-service-composition-driver.py") if composition else filename
        self.selected = ["original-nonstart-authored-analysis-composition16z"] if composition else driver.REMAINING
        self.scope = "EXACT_SERVICE_COMPOSITION16Z_OS_PARENT_AND_INPUTS" if composition else "EXACT_SERVICE_FRESH17_OS_PARENT_AND_INPUTS"
        self.files, self.directories, self.records, self.resolutions = {}, {}, {}, {}
        def file_record(name, executable=False):
            name = str(name)
            value = {"filename": name, "bytes": len(name), "sha256": hashlib.sha256(name.encode()).hexdigest(),
                "mode": 0o755 if executable else 0o644, "uid": 503, "device": 16777230, "inode": len(self.files) + 1}
            self.files[name] = value
            return copy.deepcopy(value)
        tools = {role: file_record(name, True) for role, name in {
            "node": "/inert/node", "pythonLauncher": "/inert/python/bin/python3.14",
            "pythonRuntime": "/inert/python/Resources/Python.app/Contents/MacOS/Python",
            "ps": "/bin/ps", "git": "/inert/git/bin/git", "esbuild": "/inert/modules/@esbuild/darwin-arm64/bin/esbuild",
        }.items()}
        tool_resolution = {"gitInvocation": "/inert/bin/git"}
        self.resolutions[tool_resolution["gitInvocation"]] = tools["git"]["filename"]
        for key, invoked, physical in [
            ("esbuildInvocation", root / "node_modules/@esbuild/darwin-arm64/bin/esbuild", tools["esbuild"]["filename"]),
            ("esbuildPackageMain", root / "node_modules/esbuild/lib/main.js", "/inert/modules/esbuild/lib/main.js"),
            ("esbuildPlatformPackage", root / "node_modules/@esbuild/darwin-arm64/package.json", "/inert/modules/@esbuild/darwin-arm64/package.json"),
        ]:
            tool_resolution[key] = {"invokedAs": str(invoked), "filename": physical}
            self.resolutions[str(invoked)] = physical
            if physical not in self.files:
                file_record(physical)
        attempt = str(root.parents[1] / "evidence/inert-service-admission/UNCREATED")
        environment = {"PATH": "/inert/bin:/usr/bin:/bin", "HOME": "/inert/home", "TMPDIR": "/inert/tmp", "NODE_ENV": "test", "NO_COLOR": "1", "LC_CTYPE": "C.UTF-8", "__CF_USER_TEXT_ENCODING": "0x1F7:0x0:0x0"}
        argv = [tools["pythonLauncher"]["filename"], "-I", "-S", "-B", str(self.driver_path), str(self.packet), str(self.review_path)]
        runtime_argv = [tools["pythonRuntime"]["filename"], *argv[1:]]
        invocation = {"argv": argv, "runtimeArgv": runtime_argv, "cwd": str(root), "environment": environment}
        startup = {"executable": tools["pythonLauncher"]["filename"], "pythonVersion": "inert exact Python version",
            "debug": True, "flags": dict(driver.STARTUP_FLAGS), "platform": "darwin", "machine": "arm64"}
        self.actual_context = {**copy.deepcopy(startup), "argv": argv[4:], "runtimeArgv": list(runtime_argv), "cwd": str(root), "environment": dict(environment)}
        binding_path = root.parents[1] / "evidence/service-composition16z-canonical-closure7/physical-identity-data-proposal1/physical-client-binding.proposed.DATA.json"
        c_entry = root / driver.C_RELATIVE
        c_directory = c_entry.parent
        env_root = root / ".tmp/m06-source8-template-dependencies1/env-root"
        self.env_target = str(env_root / ".env")
        c_files = []
        for name in ["index.js", *[f"inert-{index}.js" for index in range(26)]]:
            c_files.append({**file_record(c_directory / name), "relativePath": name})
        # Nine unique synthetic rows: seven owned ancestors and two copied directories.
        # No host metadata is read; device values are fixture expectations only.
        owned_paths = [env_root.parent, env_root, *[env_root.joinpath(*("a", "b", "c", "d", "e")[:index]) for index in range(1, 6)]]
        self.directory_records = []
        for index, directory in enumerate([*owned_paths, c_directory, c_directory / "runtime"]):
            record = {"filename": str(directory), "mode": 0o755, "uid": 503,
                "device": 16777230, "inode": 999 + index}
            self.directory_records.append(record)
            self.directories[str(directory)] = copy.deepcopy(record)
        self.inventory_names = [item["filename"] for item in c_files]
        facts = {"entry": str(c_entry), "directory": str(c_directory), "envRoot": str(env_root),
            "relativeEnvPaths": {"rootEnvPath": "../../../../../../.env"},
            "envTargets": [{"filename": self.env_target, "role": "rootEnvPath"}],
            "copied": {"files": c_files, "directories": self.directory_records[-2:]}, "ownedDirectories": self.directory_records[:-2]}
        self.facts = facts
        self.records[str(binding_path)] = {"facts": facts}
        binding_record = file_record(binding_path)
        self.proposal = {"cases": self.selected, "argv": [tools["node"]["filename"], "/inert/controller.mjs"], "cwd": str(root),
            "environment": {"PATH": environment["PATH"], "CUSTODY_SERVICE_PARENT_IDENTITY": str(Path(attempt) / "supervisor-identity.json")},
            "attemptDirectory": attempt, "nodeExecutable": tools["node"]["filename"], "controllerBundle": "/inert/controller.mjs",
            "driverInvocation": invocation, "driverStartup": startup, "executableTools": tools, "toolResolution": tool_resolution,
            "generatedClient": str(c_entry), "physicalClientBinding": {key: binding_record[key] for key in ["filename", "bytes", "sha256"]},
            "requiredAbsenceBeforeAllocation": [attempt, str(root / ".env"), str(root / "prisma/dev.db"), self.env_target]}
        self.manifest = {"cases": self.selected, "artifactManifestSha256": "artifact", "inputs": [{key: value[key] for key in ["filename", "bytes", "sha256"]} for value in self.files.values()]}
        artifact_review = str(self.packet / "artifact-review.json")
        for name in [self.packet / "manifest.json", self.packet / "invocation-proposal.json", artifact_review]:
            file_record(name)
        self.review = {"judgment": "ACCEPT", "scope": self.scope, "runtimeAuthorized": True,
            "manifestSha256": self.files[str(self.packet / "manifest.json")]["sha256"],
            "proposalSha256": self.files[str(self.packet / "invocation-proposal.json")]["sha256"],
            "artifactReview": artifact_review, "artifactReviewSha256": self.files[artifact_review]["sha256"]}
        for field in ["argv", "cwd", "environment", "attemptDirectory", "driverInvocation", "driverStartup", "executableTools", "toolResolution", "physicalClientBinding", "requiredAbsenceBeforeAllocation"]:
            self.review[field] = copy.deepcopy(self.proposal[field])
        self.records.update({str(self.packet / "manifest.json"): self.manifest, str(self.packet / "invocation-proposal.json"): self.proposal,
            str(self.review_path): self.review, artifact_review: {"judgment": "ACCEPT", "artifactManifestSha256": "artifact"}})

    def read(self, name):
        self.calls.append(("read", str(name)))
        if Path(name).name.startswith(".env"):
            raise AssertionError("Environment contents must never be read")
        return self.records[str(name)]

    def file(self, name):
        self.calls.append(("file", str(name)))
        if Path(name).name.startswith(".env"):
            raise AssertionError("Environment contents must never be hashed")
        return copy.deepcopy(self.files[str(name)])

    def directory(self, name):
        self.calls.append(("directory", str(name)))
        return copy.deepcopy(self.directories[str(name)])

    def inventory(self, directory):
        self.calls.append(("inventory", str(directory)))
        return sorted(self.inventory_names)

    def resolve(self, name):
        return self.resolutions.get(str(name), str(name))

    def lexists(self, name):
        self.calls.append(("lexists", str(name)))
        return str(name) in self.present or str(name) in self.links

    def which(self, name, search_path):
        return self.proposal["toolResolution"]["gitInvocation"]

    def context(self):
        return copy.deepcopy(self.actual_context)

    def allocate(self, proposal, review):
        self.allocations.append((proposal, review))

    def verify(self, module=driver):
        return module.verify_operations(self.packet, self.review_path, self.selected, self.scope, self.driver_path, self)


    def bind_review(self, field):
        self.review[field] = copy.deepcopy(self.proposal[field])

    def replace_input(self, old_filename, record):
        self.manifest["inputs"] = [item for item in self.manifest["inputs"] if item["filename"] != old_filename]
        self.manifest["inputs"].append({key: record[key] for key in ["filename", "bytes", "sha256"]})

    def select_binding(self, new_filename):
        old_filename = self.proposal["physicalClientBinding"]["filename"]
        record = copy.deepcopy(self.files[old_filename])
        record.update(filename=new_filename, bytes=len(new_filename), sha256=hashlib.sha256(new_filename.encode()).hexdigest())
        self.files[new_filename] = record
        self.records[new_filename] = copy.deepcopy(self.records[old_filename])
        self.proposal["physicalClientBinding"] = {key: record[key] for key in ["filename", "bytes", "sha256"]}
        self.replace_input(old_filename, record)
        self.bind_review("physicalClientBinding")


class AdmissionTests(unittest.TestCase):
    def test_actual_mac_startup_shape_and_both_fixed_selections_reach_only_fake_allocation(self):
        for composition in [False, True]:
            effects = InertAdmission(composition)
            self.assertNotEqual(effects.proposal["driverInvocation"]["argv"][0], effects.actual_context["runtimeArgv"][0])
            self.assertIs(effects.verify(), effects.proposal)
            self.assertEqual(len(effects.allocations), 1)

    def assert_refused(self, effects, label):
        with self.assertRaisesRegex(ValueError, "^" + label + "$"):
            effects.verify()
        self.assertEqual(effects.allocations, [])
        self.assertFalse(any(kind in {"read", "file"} and name == effects.env_target for kind, name in effects.calls))

    def test_successor_fixture_has_nine_unique_directories_and_27_files_current_device_only(self):
        for composition in [False, True]:
            effects = InertAdmission(composition)
            directories = effects.facts["ownedDirectories"] + effects.facts["copied"]["directories"]
            self.assertEqual(len(directories), 9)
            self.assertEqual(len({item["filename"] for item in directories}), 9)
            self.assertEqual(len(effects.facts["copied"]["files"]), 27)
            self.assertEqual({item["device"] for item in [*directories, *effects.facts["copied"]["files"], *effects.proposal["executableTools"].values()]}, {16777230})
            self.assertTrue(effects.proposal["physicalClientBinding"]["filename"].endswith(
                "/evidence/service-composition16z-canonical-closure7/physical-identity-data-proposal1/physical-client-binding.proposed.DATA.json"))
            self.assertIs(effects.verify(), effects.proposal)
            self.assertEqual(len(effects.allocations), 1)

    def test_only_fixed_successor_record_in_inputs_is_admitted_for_both_selections(self):
        for composition in [False, True]:
            for selection in ["old", "sibling", "omitted"]:
                with self.subTest(composition=composition, selection=selection):
                    effects = InertAdmission(composition)
                    if selection == "old":
                        effects.select_binding(str(driver.SERVICE_ROOT.parents[1] /
                            "evidence/source-regression8/client-binding16m-physical1/physical-client-binding.json"))
                    elif selection == "sibling":
                        effects.select_binding(str(Path(effects.proposal["physicalClientBinding"]["filename"]).with_name("unapproved.DATA.json")))
                    else:
                        effects.manifest["inputs"].remove(effects.proposal["physicalClientBinding"])
                    self.assertEqual(effects.review["physicalClientBinding"], effects.proposal["physicalClientBinding"])
                    if selection != "omitted":
                        self.assertIn(effects.proposal["physicalClientBinding"], effects.manifest["inputs"])
                    self.assert_refused(effects, "C_FIXED_BINDING_RECORD")

    def test_every_directory_identity_field_is_exact_for_both_selections(self):
        for composition in [False, True]:
            for row in range(9):
                for field, value in [("device", 16777233), ("device", 12345), ("inode", 12345), ("mode", 0o700), ("uid", 12345)]:
                    with self.subTest(composition=composition, row=row, field=field, value=value):
                        effects = InertAdmission(composition)
                        effects.directory_records[row][field] = value
                        self.assert_refused(effects, "C_DIRECTORY_IDENTITY_CHANGED")

    def test_every_C_file_identity_field_is_exact_for_both_selections(self):
        for composition in [False, True]:
            for row in range(27):
                for field, value in [("device", 16777233), ("device", 12345), ("sha256", "changed"), ("bytes", -1), ("inode", 12345), ("mode", 0o600), ("uid", 12345)]:
                    with self.subTest(composition=composition, row=row, field=field, value=value):
                        effects = InertAdmission(composition)
                        effects.facts["copied"]["files"][row][field] = value
                        self.assert_refused(effects, "C_DATA27_CHANGED")

    def test_C_inventory_missing_extra_and_relative_escape_refuse_for_both_selections(self):
        for composition in [False, True]:
            for mutation in ["missing-record", "extra-record", "missing-actual", "extra-actual", "relative-escape"]:
                with self.subTest(composition=composition, mutation=mutation):
                    effects = InertAdmission(composition)
                    files = effects.facts["copied"]["files"]
                    if mutation == "missing-record":
                        files.pop()
                    elif mutation == "extra-record":
                        files.append({**copy.deepcopy(files[-1]), "filename": str(Path(files[-1]["filename"]).with_name("extra.js")), "relativePath": "extra.js"})
                    elif mutation == "missing-actual":
                        effects.inventory_names.pop()
                    elif mutation == "extra-actual":
                        effects.inventory_names.append(str(Path(files[-1]["filename"]).with_name("extra.js")))
                    else:
                        files[0]["relativePath"] = "../client/index.js"
                    self.assert_refused(effects, "C_FILE_PATH_BINDING" if mutation == "relative-escape" else "C_DATA27_INVENTORY_CHANGED")

    def test_every_reviewed_executable_role_identity_field_is_exact_for_both_selections(self):
        for composition in [False, True]:
            for role in sorted(driver.TOOL_ROLES):
                for field, value in [("device", 16777233), ("device", 12345), ("inode", 12345), ("mode", 0o700), ("uid", 12345), ("sha256", "changed"), ("bytes", -1)]:
                    with self.subTest(composition=composition, role=role, field=field, value=value):
                        effects = InertAdmission(composition)
                        record = effects.proposal["executableTools"][role]
                        record[field] = value
                        effects.bind_review("executableTools")
                        effects.replace_input(record["filename"], record)
                        self.assertEqual(effects.review["executableTools"], effects.proposal["executableTools"])
                        self.assertIn({key: record[key] for key in ["filename", "bytes", "sha256"]}, effects.manifest["inputs"])
                        self.assert_refused(effects, "EXECUTABLE_TOOL_CHANGED")

    def test_foreign_context_flags_and_launcher_vectors_refuse_before_allocation(self):
        for mutate in [
            lambda x: x.actual_context.update(cwd="/foreign"),
            lambda x: x.actual_context["environment"].update(UNDECLARED="foreign"),
            lambda x: x.actual_context["environment"].update(LC_CTYPE="C"),
            lambda x: x.actual_context["environment"].update(__CF_USER_TEXT_ENCODING="foreign"),
            lambda x: x.actual_context["runtimeArgv"].__setitem__(0, x.proposal["driverInvocation"]["argv"][0]),
            lambda x: x.actual_context["runtimeArgv"].insert(1, "-O"),
            lambda x: x.actual_context["flags"].update(optimize=1),
            lambda x: x.actual_context.update(debug=False),
            lambda x: x.actual_context["flags"].update(no_site=0),
        ]:
            effects = InertAdmission()
            mutate(effects)
            with self.assertRaises(ValueError):
                effects.verify()
            self.assertEqual(effects.allocations, [])

    def test_optimized_actual_admission_source_explicitly_refuses_even_when_assertions_removed(self):
        module = types.ModuleType("inert_optimized_admission")
        module.__file__ = str(filename)
        exec(compile(filename.read_text(), str(filename), "exec", optimize=1), module.__dict__)
        effects = InertAdmission()
        with self.assertRaisesRegex(ValueError, "ASSERTIONS_DISABLED"):
            effects.verify(module)
        self.assertEqual(effects.calls, [])
        self.assertEqual(effects.allocations, [])

    def test_every_executable_identity_and_actual_path_resolution_is_admitted(self):
        for role in driver.TOOL_ROLES:
            effects = InertAdmission()
            effects.files[effects.proposal["executableTools"][role]["filename"]]["sha256"] = "changed"
            with self.assertRaisesRegex(ValueError, "EXECUTABLE_TOOL_CHANGED"):
                effects.verify()
            self.assertEqual(effects.allocations, [])
        for key in ["gitInvocation", "esbuildInvocation", "esbuildPackageMain", "esbuildPlatformPackage"]:
            effects = InertAdmission()
            invoked = effects.proposal["toolResolution"][key]
            effects.resolutions[invoked if isinstance(invoked, str) else invoked["invokedAs"]] = "/foreign/tool"
            with self.assertRaises(ValueError):
                effects.verify()
            self.assertEqual(effects.allocations, [])

    def test_C_env_file_dangling_link_wrong_target_and_physical_drift_refuse_without_reading_env(self):
        for mutate in [
            lambda x: x.present.add(x.env_target),
            lambda x: x.links.add(x.env_target),  # Existing target absent; lexists still sees this dangling link.
            lambda x: x.proposal["requiredAbsenceBeforeAllocation"].pop(),
            lambda x: x.proposal["requiredAbsenceBeforeAllocation"].__setitem__(-1, "/arbitrary/.env"),
            lambda x: x.directories[next(iter(x.directories))].update(inode=1000),
            lambda x: x.files[x.proposal["generatedClient"]].update(inode=1000),
        ]:
            for composition in [False, True]:
                effects = InertAdmission(composition)
                mutate(effects)
                with self.assertRaises(ValueError):
                    effects.verify()
                self.assertEqual(effects.allocations, [])
                self.assertFalse(any(kind in {"read", "file"} and name == effects.env_target for kind, name in effects.calls))


if __name__ == "__main__":
    unittest.main()
