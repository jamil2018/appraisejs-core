"""Disposable, offline tests for the fixed T2/T3 retention cleanup boundary."""

import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SOURCE = (
    pathlib.Path(__file__).parent
    / "fixtures/codex-app-server-m02-ta-cleanup-r11/phase-history-cleanup.py"
)
SPEC = importlib.util.spec_from_file_location("m02_phase_history_cleanup", SOURCE)
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def owned_file(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(raw)
    path.chmod(0o600)
    return sha(raw)


def private(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)
    return path


class Fixture:
    def __init__(self, phase="T3"):
        self.temp = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.base = pathlib.Path(self.temp.name)
        self.phase = phase
        self.case_ids = cleanup.CASES[phase]
        self.case = self.case_ids[0]
        self.repo = private(self.base / "repo")
        self.root = private(self.base / "root")
        self.layout = {"repo": str(self.repo), "root": str(self.root)}
        self.app = private(self.repo / ".appraisejs")
        self.evidence = private(
            self.app / f"m02-ta-{phase.lower()}-retention-evidence-r11"
        )
        cases_dir = private(self.root / "cases")
        self.case_data = {}
        for case_id in self.case_ids:
            case_dir = private(cases_dir / case_id)
            supervisor = private(case_dir / "supervisor")
            raw = {name: private(case_dir / name) for name in cleanup.RAW}
            witness = {
                "schema": "appraise.m02-ta-matrix-supervisor-receipt/v1",
                "evidenceClass": "TRUSTED_SUPERVISOR_OBSERVATION",
                "name": "case-outcome",
                "caseId": case_id,
            }
            witness_sha = owned_file(
                supervisor / "case-outcome.json",
                (json.dumps(witness) + "\n").encode(),
            )
            self.case_data[case_id] = {
                "directory": case_dir,
                "supervisor": supervisor,
                "raw": raw,
                "witness": witness,
                "witnessSha256": witness_sha,
            }
        first = self.case_data[self.case]
        self.case_dir = first["directory"]
        self.supervisor = first["supervisor"]
        self.raw = first["raw"]
        self.witness = first["witness"]
        self.witness_sha = first["witnessSha256"]
        self.outside = owned_file(self.base / "outside.txt", b"outside preserved")
        os.symlink(str(self.base / "outside.txt"), self.raw["home"] / "outside-link")
        private(self.raw["codex"] / "nested")
        owned_file(
            self.raw["codex"] / "nested" / "history.json", b"provider-local transcript"
        )
        self.journal = self._journal()
        self.journal_sha = owned_file(self.root / "phase-journal.jsonl", self.journal)
        archive_name = (
            "m02-ta-t2-r12-execution-evidence-01"
            if phase == "T2"
            else "m02-ta-t3-safe-execution-evidence-01"
        )
        self.archive = private(self.app / archive_name)
        self.manifest_doc = {
            "manifest": {
                "phase": phase,
                "root": str(self.root),
                "cases": list(self.case_ids),
            },
            "manifestDigest": "1" * 64,
        }
        self.manifest_pin = self.pin(
            ".appraisejs/m02-source-build/manifest.json",
            (json.dumps(self.manifest_doc) + "\n").encode(),
        )
        self.artifact_pin = self.pin(
            f".appraisejs/{archive_name}/copy.json", b'{"safe":true}\n'
        )
        copied_records = [
            {
                "status": "COPIED",
                "copy": "copy.json",
                "sha256": self.artifact_pin["sha256"],
            }
        ]
        self.safe_artifacts = [self.artifact_pin]
        source_files = [("phase-journal.jsonl", self.root / "phase-journal.jsonl")]
        source_files.extend(
            (
                f"cases/{case_id}/supervisor/case-outcome.json",
                data["supervisor"] / "case-outcome.json",
            )
            for case_id, data in self.case_data.items()
        )
        for source, path in source_files:
            copy = source.replace("/", "--")
            pin = self.pin(f".appraisejs/{archive_name}/{copy}", path.read_bytes())
            self.safe_artifacts.append(pin)
            copied_records.append(
                {
                    "status": "COPIED",
                    "source": source,
                    "copy": copy,
                    "sha256": pin["sha256"],
                }
            )
        self.index_doc = {
            "schema": "appraise.m02-ta-r12-sanitized-evidence-archive/v1",
            "sourceRoot": str(self.root),
            "outcome": "T2_CASES_COMPLETED" if phase == "T2" else "T3_CASES_COMPLETED",
            "manifestSha256": self.manifest_pin["sha256"],
            "manifestDigest": self.manifest_doc["manifestDigest"],
            "sourceEvidenceChanged": False,
            "records": copied_records,
        }
        self.index_pin = self.pin(
            f".appraisejs/{archive_name}/index.json",
            (json.dumps(self.index_doc) + "\n").encode(),
        )
        self.plan = {
            "schema": "appraise.m02-ta-retention-plan/v1",
            "phase": phase,
            "root": str(self.root),
            "rootIdentity": self.identity(self.root, uid=True),
            "journalSha256": self.journal_sha,
            "cases": [
                {
                    "caseId": case_id,
                    "finishHash": self.finish_hashes[case_id],
                    "witnessSha256": data["witnessSha256"],
                    "raw": {
                        name: self.identity(path) for name, path in data["raw"].items()
                    },
                }
                for case_id, data in self.case_data.items()
            ],
            "pins": {
                "manifest": self.manifest_pin,
                "actualReview": None,
                "safeIndex": self.index_pin,
                "safeArtifacts": self.safe_artifacts,
            },
        }
        self.review_doc = {
            "schema": (
                "appraise.m02-ta-t2-r12-actual-review/v1"
                if phase == "T2"
                else "appraise.m02-ta-t3-actual-review/v1"
            ),
            "verdict": (
                "ACCEPT_T2_R12_ACTUAL_WITH_LIMITS"
                if phase == "T2"
                else "ACCEPT_T3_ACTUAL_WITH_LIMITS"
            ),
            "runtimeVerdict": self.index_doc["outcome"],
            "execution": {
                "root": str(self.root),
                "rootIdentity": self.plan["rootIdentity"],
                "manifestDigest": self.manifest_doc["manifestDigest"],
            },
            "archive": {
                "indexSha256": self.index_pin["sha256"],
                "sourceEvidenceChanged": False,
                "sourceArchiveByteEquality": True,
                "currentSourceIdentitiesMatch": True,
            },
            "journal": {
                "sha256": self.journal_sha,
                "terminalHash": self.terminal_hash,
                "checkpointSeq": self.checkpoint_seq,
                "unknown": False,
                "pending": [],
            },
            "cases": [
                {key: case[key] for key in ("caseId", "finishHash", "witnessSha256")}
                for case in self.plan["cases"]
            ],
        }
        self.review_pin = self.pin(
            ".appraisejs/m02-t2-r12-execution-review-01.json"
            if phase == "T2"
            else ".appraisejs/m02-t3-independent-actual-review.json",
            (json.dumps(self.review_doc) + "\n").encode(),
        )
        self.plan["pins"]["actualReview"] = self.review_pin
        self.write_plan()

    @staticmethod
    def identity(path, uid=False):
        info = path.stat()
        result = {"dev": info.st_dev, "ino": info.st_ino}
        if uid:
            result["uid"] = info.st_uid
        return result

    def pin(self, relative, raw):
        digest = owned_file(self.repo / relative, raw)
        return {"path": relative, "sha256": digest}

    def _journal(self):
        lines, previous = [], "0" * 64
        events = [
            {
                "type": "init",
                "phase": self.phase,
                "directoryIdentity": self.identity(self.root),
                "startedAt": "2026-10-16T00:00:00.000Z",
            }
        ]
        for case_id in self.case_ids:
            events.extend(
                [
                    {
                        "type": "begin",
                        "caseId": case_id,
                        "at": "2026-10-16T00:00:01.000Z",
                    },
                    {
                        "type": "finish",
                        "outcome": "workspace-effect"
                        if self.phase == "T3"
                        else "accepted",
                        "cleanupKnown": True,
                        "at": "2026-10-16T00:00:02.000Z",
                        "caseWitnessSha256": self.case_data[case_id]["witnessSha256"],
                    },
                ]
            )
        events.append({"type": "checkpoint"})
        self.finish_hashes = {}
        for seq, event in enumerate(events, 1):
            body = {"seq": seq, "previous": previous, "event": event}
            previous = sha(
                json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
            )
            lines.append(json.dumps({**body, "hash": previous}, separators=(",", ":")))
            if event["type"] == "finish":
                self.finish_hashes[events[seq - 2]["caseId"]] = previous
        self.finish_hash = self.finish_hashes[self.case]
        self.terminal_hash = previous
        self.checkpoint_seq = len(lines)
        return ("\n".join(lines) + "\n").encode()

    def write_plan(self):
        stem = f"m02-ta-{self.phase.lower()}-retention-build-r11"
        self.plan_path = self.app / stem / "manifest.json"
        raw = (json.dumps(self.plan, sort_keys=True) + "\n").encode()
        self.plan_sha = owned_file(self.plan_path, raw)

    def run(self):
        return cleanup.cleanup_once(self.phase, self.plan_sha, _test_layout=self.layout)

    def close(self):
        self.temp.cleanup()


class PhaseHistoryCleanupTest(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()

    def tearDown(self):
        self.fixture.close()

    def test_success_removes_only_three_raw_trees_and_preserves_external_symlink_target(
        self,
    ):
        result = self.fixture.run()
        self.assertEqual(
            result["status"], "SUCCESSFUL_CURRENT_CASES_RAW_HISTORY_REMOVED"
        )
        for path in self.fixture.raw.values():
            self.assertFalse(path.exists())
        self.assertEqual(
            (self.fixture.base / "outside.txt").read_bytes(), b"outside preserved"
        )
        self.assertTrue((self.fixture.root / "phase-journal.jsonl").exists())
        self.assertTrue((self.fixture.supervisor / "case-outcome.json").exists())
        self.assertTrue((self.fixture.archive / "index.json").exists())
        self.assertTrue((self.fixture.evidence / "intent.json").exists())
        self.assertTrue((self.fixture.evidence / "result.json").exists())
        self.assertFalse((self.fixture.archive / "intent.json").exists())
        with self.assertRaises(RuntimeError):
            self.fixture.run()

    def test_wrong_plan_digest_rejected_before_intent(self):
        with self.assertRaisesRegex(RuntimeError, "pinned file bytes drift"):
            cleanup.cleanup_once("T3", "0" * 64, _test_layout=self.fixture.layout)
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_hardlink_rejected_by_all_tree_preflight(self):
        os.link(
            self.fixture.base / "outside.txt",
            self.fixture.raw["tmp"] / "foreign-hardlink",
        )
        with self.assertRaisesRegex(RuntimeError, "raw hardlink rejected"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])
        self.assertTrue(all(path.exists() for path in self.fixture.raw.values()))

    def test_special_file_rejected_before_intent(self):
        os.mkfifo(self.fixture.raw["tmp"] / "pipe", 0o600)
        with self.assertRaisesRegex(RuntimeError, "raw special file rejected"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_symlinked_raw_root_rejected_and_target_preserved(self):
        old = self.fixture.raw["tmp"]
        old.rmdir()
        os.symlink(str(self.fixture.base), old)
        with self.assertRaises(OSError):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])
        self.assertEqual(
            (self.fixture.base / "outside.txt").read_bytes(), b"outside preserved"
        )

    def test_archive_drift_rejected_before_intent(self):
        owned_file(self.fixture.archive / "copy.json", b"changed")
        with self.assertRaisesRegex(RuntimeError, "pinned file bytes drift"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_safe_index_must_pin_every_copied_artifact(self):
        index_path = self.fixture.archive / "index.json"
        new_index = dict(self.fixture.index_doc)
        new_index["records"] = [
            *self.fixture.index_doc["records"],
            {"status": "COPIED", "copy": "unlisted.json", "sha256": "a" * 64},
        ]
        self.fixture.plan["pins"]["safeIndex"]["sha256"] = owned_file(
            index_path, (json.dumps(new_index) + "\n").encode()
        )
        self.fixture.review_doc["archive"]["indexSha256"] = self.fixture.plan["pins"][
            "safeIndex"
        ]["sha256"]
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"],
            (json.dumps(self.fixture.review_doc) + "\n").encode(),
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "safe copied artifacts incomplete"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_archive_file_must_be_private_single_link(self):
        (self.fixture.archive / "copy.json").chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, "pinned file metadata rejected"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_wrong_raw_identity_rejected_before_intent(self):
        self.fixture.plan["cases"][0]["raw"]["codex"]["ino"] += 1
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "private directory drift"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_deletion_failure_records_unknown_and_consumes_command(self):
        with (
            patch.object(
                cleanup,
                "_erase_tree",
                side_effect=RuntimeError("injected deletion interruption"),
            ),
            self.assertRaisesRegex(RuntimeError, "injected deletion interruption"),
        ):
            self.fixture.run()
        result = json.loads((self.fixture.evidence / "result.json").read_text())
        self.assertEqual(result["status"], "UNKNOWN_PARTIAL_OR_UNVERIFIED")
        self.assertTrue((self.fixture.evidence / "intent.json").exists())
        with self.assertRaisesRegex(RuntimeError, "cleanup evidence already consumed"):
            self.fixture.run()

    def test_unknown_journal_rejected_even_when_pinned(self):
        self.fixture.plan["journalSha256"] = owned_file(
            self.fixture.root / "phase-journal.jsonl",
            self.fixture.journal
            + b'{"seq":4,"previous":"x","event":{"type":"unknown"},"hash":"x"}\n',
        )
        self.fixture.write_plan()
        with self.assertRaises(RuntimeError):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_witness_finish_mismatch_rejected(self):
        self.fixture.plan["cases"][0]["finishHash"] = "0" * 64
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "finish evidence mismatch"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_nonprivate_ancestor_rejected(self):
        self.fixture.case_dir.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, "private directory drift"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_plan_rejects_foreign_case(self):
        self.fixture.plan["cases"][0]["caseId"] = "T1"
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "case IDs"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_t2_disposable_case(self):
        self.fixture.close()
        self.fixture = Fixture("T2")
        self.assertEqual(
            self.fixture.run()["status"], "SUCCESSFUL_CURRENT_CASES_RAW_HISTORY_REMOVED"
        )

    def test_t2_fixed_target_excludes_historical_p1_without_opening_it(self):
        self.assertEqual(cleanup.ROOTS["T2"], "/private/tmp/appraise-m02-ta-matrix-p2")
        self.fixture.close()
        self.fixture = Fixture("T2")
        self.fixture.plan["root"] = "/private/tmp/appraise-m02-ta-matrix-p1"
        self.fixture.write_plan()
        with (
            patch.object(
                cleanup, "_open_absolute", wraps=cleanup._open_absolute
            ) as opened,
            self.assertRaisesRegex(RuntimeError, "plan phase/root"),
        ):
            self.fixture.run()
        self.assertTrue(
            all(
                call.args[0] != "/private/tmp/appraise-m02-ta-matrix-p1"
                for call in opened.call_args_list
            )
        )
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_t2_requires_accepted_r12_actual_review(self):
        self.fixture.close()
        self.fixture = Fixture("T2")
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"],
            b'{"schema":"appraise.m02-ta-t2-r12-actual-review/v1","verdict":"REVISE"}\n',
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "actual review acceptance absent"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_hash_valid_journal_prefix_without_checkpoint_rejected(self):
        prefix = b"\n".join(self.fixture.journal.splitlines()[:-1]) + b"\n"
        self.fixture.plan["journalSha256"] = owned_file(
            self.fixture.root / "phase-journal.jsonl", prefix
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "incomplete terminal checkpoint"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_completed_subset_cannot_delete_while_phase_incomplete(self):
        self.fixture.plan["cases"] = self.fixture.plan["cases"][:1]
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "case count"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_review_binding_rejects_unknown_and_foreign_root(self):
        self.fixture.review_doc["journal"]["unknown"] = True
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"],
            (json.dumps(self.fixture.review_doc) + "\n").encode(),
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(
            RuntimeError, "actual review evidence binding mismatch"
        ):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_index_rejects_foreign_source_root_even_if_pinned(self):
        self.fixture.index_doc["sourceRoot"] = "/private/tmp/foreign"
        self.fixture.plan["pins"]["safeIndex"]["sha256"] = owned_file(
            self.fixture.archive / "index.json",
            (json.dumps(self.fixture.index_doc) + "\n").encode(),
        )
        self.fixture.review_doc["archive"]["indexSha256"] = self.fixture.plan["pins"][
            "safeIndex"
        ]["sha256"]
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"],
            (json.dumps(self.fixture.review_doc) + "\n").encode(),
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(
            RuntimeError, "safe index source/outcome binding mismatch"
        ):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_index_without_copied_case_witness_rejected(self):
        missing = f"cases/{self.fixture.case}/supervisor/case-outcome.json"
        record = next(
            item
            for item in self.fixture.index_doc["records"]
            if item.get("source") == missing
        )
        self.fixture.index_doc["records"].remove(record)
        self.fixture.plan["pins"]["safeArtifacts"] = [
            item
            for item in self.fixture.safe_artifacts
            if not item["path"].endswith(record["copy"])
        ]
        self.fixture.plan["pins"]["safeIndex"]["sha256"] = owned_file(
            self.fixture.archive / "index.json",
            (json.dumps(self.fixture.index_doc) + "\n").encode(),
        )
        self.fixture.review_doc["archive"]["indexSha256"] = self.fixture.plan["pins"][
            "safeIndex"
        ]["sha256"]
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"],
            (json.dumps(self.fixture.review_doc) + "\n").encode(),
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "safe archived witnesses incomplete"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_t3_review_must_have_accepted_shape(self):
        self.fixture.plan["pins"]["actualReview"]["sha256"] = owned_file(
            self.fixture.repo / self.fixture.review_pin["path"], b'{"reviewed":true}\n'
        )
        self.fixture.write_plan()
        with self.assertRaisesRegex(RuntimeError, "actual review acceptance absent"):
            self.fixture.run()
        self.assertEqual(list(self.fixture.evidence.iterdir()), [])

    def test_cli_has_no_path_override(self):
        with self.assertRaisesRegex(RuntimeError, "exact cleanup invocation required"):
            cleanup.main(
                ["--cleanup-once", "T3", "0" * 64, "--root", str(self.fixture.root)]
            )


if __name__ == "__main__":
    unittest.main()
