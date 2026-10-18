"""Pure empty-grant reply guards; no CLI, auth, sockets or inference."""

import importlib.util
import pathlib
import sys
import unittest

sys.dont_write_bytecode = True
source = (
    pathlib.Path(__file__).parent
    / "fixtures/codex-app-server-m01/permission-denial-probe.py"
)
spec = importlib.util.spec_from_file_location("m01_denial", source)
denial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(denial)


class EmptyGrant(unittest.TestCase):
    def frame(self, request_id=0):
        return {
            "id": request_id,
            "method": "item/permissions/requestApproval",
            "params": {
                "threadId": "synthetic-thread",
                "turnId": "synthetic-turn",
                "itemId": "synthetic-item",
                "permissions": {
                    "network": {"enabled": True},
                    "fileSystem": {"write": ["/private/tmp/synthetic"]},
                },
            },
        }

    def test_requested_permissions_are_never_echoed_as_granted(self):
        for request_id in [0, "synthetic-request"]:
            with self.subTest(request_id=request_id):
                self.assertEqual(
                    denial.empty_grant(self.frame(request_id), "synthetic-thread"),
                    {"id": request_id, "result": {"permissions": {}, "scope": "turn"}},
                )

    def test_foreign_thread_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, "correlation mismatch"):
            denial.empty_grant(self.frame(), "another-thread")

    def test_missing_turn_or_item_is_refused(self):
        for key in ["turnId", "itemId"]:
            with self.subTest(key=key):
                frame = self.frame()
                del frame["params"][key]
                with self.assertRaisesRegex(RuntimeError, "correlation mismatch"):
                    denial.empty_grant(frame, "synthetic-thread")

    def test_unplanned_request_method_is_refused(self):
        frame = self.frame()
        frame["method"] = "item/commandExecution/requestApproval"
        with self.assertRaisesRegex(RuntimeError, "unplanned request"):
            denial.empty_grant(frame, "synthetic-thread")


if __name__ == "__main__":
    unittest.main()
