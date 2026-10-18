import hashlib
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

SOURCE = (
    Path(__file__).parent
    / "fixtures/codex-app-server-m02-ta-cleanup-r10/p6-history-cleanup.py"
)
spec = importlib.util.spec_from_file_location("p6_cleanup", SOURCE)
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    def test_hardlinks_fail_preflight_without_deleting_history(self):
        with tempfile.TemporaryDirectory(prefix="appraise-cleanup-offline-") as work:
            root = Path(work) / "owned"
            root.mkdir()
            raw = root / "raw"
            raw.write_bytes(b"synthetic")
            os.link(raw, Path(work) / "outside-link")
            fd = os.open(root, cleanup.FLAGS)
            try:
                with self.assertRaisesRegex(RuntimeError, "hardlink rejected"):
                    cleanup.inspect_tree(fd, os.getuid(), os.fstat(fd).st_dev, [0])
            finally:
                os.close(fd)
            self.assertTrue(raw.exists())

    def test_safe_archive_hash_drift_blocks_retention_cleanup(self):
        with tempfile.TemporaryDirectory(prefix="appraise-cleanup-offline-") as work:
            old_repo, old_archive = cleanup.REPO, cleanup.ARCHIVE
            cleanup.REPO, cleanup.ARCHIVE = work, work + "/archive"
            try:
                Path(cleanup.ARCHIVE).mkdir(mode=0o700)
                index = Path(cleanup.ARCHIVE) / "index.json"
                index.write_bytes(b"synthetic safe index")
                index.chmod(0o600)
                review = {
                    "archive": {
                        "indexSha256": hashlib.sha256(index.read_bytes()).hexdigest()
                    },
                    "boundArtifacts": {},
                }
                cleanup.verify_archive(review, os.getuid())
                index.write_bytes(b"corrupted")
                with self.assertRaisesRegex(RuntimeError, "safe archive bytes drift"):
                    cleanup.verify_archive(review, os.getuid())
            finally:
                cleanup.REPO, cleanup.ARCHIVE = old_repo, old_archive

    def test_deletes_only_owned_entries_without_reading_or_following_symlinks(self):
        with tempfile.TemporaryDirectory(prefix="appraise-cleanup-offline-") as work:
            root = Path(work) / "owned"
            root.mkdir(mode=0o700)
            outside = Path(work) / "preserved"
            outside.write_bytes(b"preserve unrelated fixture")
            (root / "nested").mkdir()
            (root / "nested" / "raw").write_bytes(b"synthetic history")
            (root / "link").symlink_to(outside)
            fd = os.open(root, cleanup.FLAGS)
            counts = {"entries": 0, "directories": 0, "files": 0, "symlinks": 0}
            try:
                cleanup.erase_contents(fd, os.getuid(), os.fstat(fd).st_dev, counts)
            finally:
                os.close(fd)
            self.assertEqual(list(root.iterdir()), [])
            self.assertEqual(outside.read_bytes(), b"preserve unrelated fixture")
            self.assertEqual(
                counts, {"entries": 3, "directories": 1, "files": 1, "symlinks": 1}
            )

    def test_foreign_owner_expectation_fails_before_deleting(self):
        with tempfile.TemporaryDirectory(prefix="appraise-cleanup-offline-") as work:
            raw = Path(work) / "raw"
            raw.write_bytes(b"synthetic")
            fd = os.open(work, cleanup.FLAGS)
            try:
                with self.assertRaisesRegex(RuntimeError, "ownership drift"):
                    cleanup.erase_contents(
                        fd, os.getuid() + 1, os.fstat(fd).st_dev, {"entries": 0}
                    )
            finally:
                os.close(fd)
            self.assertTrue(raw.exists())

    def test_entry_quota_fails_before_deleting(self):
        with tempfile.TemporaryDirectory(prefix="appraise-cleanup-offline-") as work:
            raw = Path(work) / "raw"
            raw.write_bytes(b"synthetic")
            fd = os.open(work, cleanup.FLAGS)
            try:
                with self.assertRaisesRegex(RuntimeError, "entry bound"):
                    cleanup.erase_contents(
                        fd, os.getuid(), os.fstat(fd).st_dev, {"entries": 10000}
                    )
            finally:
                os.close(fd)
            self.assertTrue(raw.exists())


if __name__ == "__main__":
    unittest.main()
