"""Deterministic native-probe budget and fail-closed guards; no login or inference."""

import importlib.util
import io
import json
import pathlib
import tempfile
import types
import unittest

source = (
    pathlib.Path(__file__).parent
    / "fixtures/codex-app-server-m01/native-provider-probe.py"
)
spec = importlib.util.spec_from_file_location("m01_native_probe", source)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class NativeProbeGuards(unittest.TestCase):
    def test_missing_existing_login_fails_before_preparation(self):
        with (
            tempfile.TemporaryDirectory(dir="/private/tmp") as directory,
            self.assertRaisesRegex(RuntimeError, "AUTHENTICATION_REQUIRED"),
        ):
            probe.prepare(pathlib.Path(directory))

    def test_changed_auth_link_is_rejected(self):
        with tempfile.TemporaryDirectory(
            prefix="appraise-m01-native-", dir="/private/tmp"
        ) as directory:
            root = pathlib.Path(directory)
            (root / "codex").mkdir()
            (root / "codex/config.toml").write_text(probe.CONFIG)
            (root / "codex/auth.json").symlink_to("/private/tmp/unexpected-auth")
            probe.save(
                root / "receipt.json",
                {
                    "stateId": root.name,
                    "binarySha256": probe.BINARY_SHA,
                    "sourceSha256": probe.digest(source.read_bytes()),
                    "existingAuthFile": "/private/tmp/expected-auth",
                },
            )
            with self.assertRaisesRegex(RuntimeError, "auth binding changed"):
                probe.receipt(root)

    def test_fourth_turn_is_refused_before_send(self):
        connection = types.SimpleNamespace(
            send=lambda *_args: self.fail("unexpected send")
        )
        with self.assertRaisesRegex(RuntimeError, "three-start limit"):
            probe.start_turn(
                connection, pathlib.Path("/private/tmp"), {"turnStarts": 3}, "synthetic"
            )

    def test_send_loss_keeps_durable_consumed_budget(self):
        def unknown_send(*_args):
            raise OSError("synthetic transport loss")

        connection = types.SimpleNamespace(
            thread_id="fixture-thread", send=unknown_send
        )
        with tempfile.TemporaryDirectory(
            prefix="appraise-m01-native-", dir="/private/tmp"
        ) as directory:
            root = pathlib.Path(directory)
            receipt = {"turnStarts": 0}
            with self.assertRaises(OSError):
                probe.start_turn(connection, root, receipt, "synthetic")
            self.assertEqual(
                json.loads((root / "receipt.json").read_text())["turnStarts"], 1
            )

    def test_existing_probe_cannot_be_restarted(self):
        with tempfile.TemporaryDirectory(
            prefix="appraise-m01-native-", dir="/private/tmp"
        ) as directory:
            root = pathlib.Path(directory)
            (root / "codex").mkdir()
            (root / "codex/config.toml").write_text(probe.CONFIG)
            probe.save(
                root / "receipt.json",
                {
                    "stateId": root.name,
                    "binarySha256": probe.BINARY_SHA,
                    "sourceSha256": probe.digest(source.read_bytes()),
                    "signInCompleted": True,
                    "probeStarted": True,
                },
            )
            with self.assertRaisesRegex(RuntimeError, "do not redispatch"):
                probe.probe(root)

    def test_missing_auth_fails_without_starting_an_attempt(self):
        with tempfile.TemporaryDirectory(
            prefix="appraise-m01-native-", dir="/private/tmp"
        ) as directory:
            root = pathlib.Path(directory)
            (root / "codex").mkdir()
            (root / "codex/config.toml").write_text(probe.CONFIG)
            probe.save(
                root / "receipt.json",
                {
                    "stateId": root.name,
                    "binarySha256": probe.BINARY_SHA,
                    "sourceSha256": probe.digest(source.read_bytes()),
                    "probeStarted": False,
                    "turnStarts": 0,
                },
            )
            with self.assertRaisesRegex(RuntimeError, "AUTHENTICATION_REQUIRED"):
                probe.probe(root)
            self.assertEqual(
                json.loads((root / "receipt.json").read_text())["turnStarts"], 0
            )

    def test_unexpected_request_is_denied_before_parking(self):
        connection = probe.Connection.__new__(probe.Connection)
        connection.process = types.SimpleNamespace(stdin=io.BytesIO())
        connection.drop_id = None
        with self.assertRaisesRegex(RuntimeError, "unexpected server request"):
            connection.frame(
                {"id": "fixture-request", "method": "item/permissions/requestApproval"}
            )
        reply = json.loads(connection.process.stdin.getvalue())
        self.assertEqual(reply["id"], "fixture-request")
        self.assertEqual(reply["error"]["code"], -32601)

    def test_cached_terminal_is_not_lost_while_waiting_for_ack(self):
        connection = probe.Connection.__new__(probe.Connection)
        connection.frames = [
            {"method": "turn/completed", "params": {"turn": {"id": "fixture-turn"}}}
        ]
        self.assertEqual(
            connection.wait(lambda f: f["method"] == "turn/completed"),
            connection.frames[0],
        )


if __name__ == "__main__":
    unittest.main()
