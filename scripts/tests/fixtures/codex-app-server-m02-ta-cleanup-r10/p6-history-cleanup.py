"""One-shot successful-P6 raw-history retention cleanup. Never touches UNKNOWN roots."""

import hashlib
import json
import os
import stat
import sys
from datetime import datetime, timezone

ROOT = "/private/tmp/appraise-m02-ta-descriptors-p6"
REPO = "/Users/jamil/Personal Projects/appraisejs"
REVIEW = REPO + "/.appraisejs/m02-t1-r9-execution-review.json"
REVIEW_SHA = "b2c5b8d64b95f3046de08b9150c82aa415c38137f6a32a4d6b70db6c040b898f"
ARCHIVE = REPO + "/.appraisejs/m02-ta-t1-r9-execution-evidence-01"
ROOT_ID = (16777230, 68761352)
RAW_IDS = {"home": 68762122, "codex": 68762123, "tmp": 68762125}
FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def same(a, b):
    return (a.st_dev, a.st_ino, a.st_uid, stat.S_IFMT(a.st_mode)) == (
        b.st_dev,
        b.st_ino,
        b.st_uid,
        stat.S_IFMT(b.st_mode),
    )


def erase_contents(fd, uid, dev, counts, depth=0):
    """FD-relative traversal; metadata only. Symlink targets are never opened."""
    if depth > 24:
        raise RuntimeError("cleanup depth bound")
    for name in os.listdir(fd):
        counts["entries"] += 1
        if counts["entries"] > 10000:
            raise RuntimeError("cleanup entry bound")
        before = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if before.st_uid != uid or before.st_dev != dev:
            raise RuntimeError("cleanup ownership drift")
        if stat.S_ISDIR(before.st_mode):
            child = os.open(name, FLAGS, dir_fd=fd)
            try:
                if not same(before, os.fstat(child)):
                    raise RuntimeError("cleanup child replaced")
                erase_contents(child, uid, dev, counts, depth + 1)
                if not same(before, os.stat(name, dir_fd=fd, follow_symlinks=False)):
                    raise RuntimeError("cleanup child replaced")
            finally:
                os.close(child)
            os.rmdir(name, dir_fd=fd)
            counts["directories"] += 1
        elif stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
            if stat.S_ISREG(before.st_mode) and before.st_nlink != 1:
                raise RuntimeError("raw history hardlink rejected")
            if not same(before, os.stat(name, dir_fd=fd, follow_symlinks=False)):
                raise RuntimeError("cleanup entry replaced")
            os.unlink(name, dir_fd=fd)
            counts["symlinks" if stat.S_ISLNK(before.st_mode) else "files"] += 1
        else:
            raise RuntimeError("cleanup unsupported entry")
    os.fsync(fd)


def inspect_tree(fd, uid, dev, count, depth=0):
    if depth > 24:
        raise RuntimeError("cleanup depth bound")
    for name in os.listdir(fd):
        count[0] += 1
        if count[0] > 10000:
            raise RuntimeError("cleanup entry bound")
        entry = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if entry.st_uid != uid or entry.st_dev != dev:
            raise RuntimeError("cleanup ownership drift")
        if stat.S_ISDIR(entry.st_mode):
            child = os.open(name, FLAGS, dir_fd=fd)
            try:
                if not same(entry, os.fstat(child)):
                    raise RuntimeError("cleanup child replaced")
                inspect_tree(child, uid, dev, count, depth + 1)
            finally:
                os.close(child)
        elif stat.S_ISREG(entry.st_mode):
            if entry.st_nlink != 1:
                raise RuntimeError("raw history hardlink rejected")
        elif not stat.S_ISLNK(entry.st_mode):
            raise RuntimeError("cleanup unsupported entry")


def verify_archive(review, uid):
    expected = {ARCHIVE + "/index.json": review["archive"]["indexSha256"]}
    for relative, digest in review["boundArtifacts"].items():
        path = REPO + "/" + relative
        if path.startswith(ARCHIVE + "/"):
            expected[path] = digest
    for path, digest in expected.items():
        handle = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            before = os.fstat(handle)
            if (
                not stat.S_ISREG(before.st_mode)
                or before.st_uid != uid
                or before.st_nlink != 1
                or stat.S_IMODE(before.st_mode) != 0o600
                or before.st_size > 1048576
            ):
                raise RuntimeError("safe archive metadata drift")
            raw = os.read(handle, 1048577)
            if len(raw) != before.st_size or hashlib.sha256(raw).hexdigest() != digest:
                raise RuntimeError("safe archive bytes drift")
            if not same(before, os.stat(path, follow_symlinks=False)):
                raise RuntimeError("safe archive identity drift")
        finally:
            os.close(handle)


def exclusive_receipt(name, value):
    fd = os.open(
        ARCHIVE + "/" + name,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
    )
    try:
        raw = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)
    parent = os.open(ARCHIVE, FLAGS)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def main():
    if sys.argv[1:] != ["--cleanup-successful-p6-once"]:
        raise RuntimeError("exact one-shot cleanup flag required")
    uid = os.getuid()
    review_fd = os.open(REVIEW, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        review_stat = os.fstat(review_fd)
        if (
            not stat.S_ISREG(review_stat.st_mode)
            or review_stat.st_uid != uid
            or review_stat.st_size > 262144
        ):
            raise RuntimeError("review identity rejected")
        raw = os.read(review_fd, 262145)
    finally:
        os.close(review_fd)
    if hashlib.sha256(raw).hexdigest() != REVIEW_SHA:
        raise RuntimeError("review bytes drift")
    review = json.loads(raw)
    if (
        review["runtimeVerdict"] != "T1_CAPTURED"
        or review["journal"]["unknown"]
        or review["journal"]["pending"]
    ):
        raise RuntimeError("successful terminal evidence required")
    root = os.open(ROOT, FLAGS)
    opened = []
    try:
        root_stat = os.fstat(root)
        if (
            (root_stat.st_dev, root_stat.st_ino) != ROOT_ID
            or root_stat.st_uid != uid
            or stat.S_IMODE(root_stat.st_mode) != 0o700
        ):
            raise RuntimeError("p6 root identity drift")
        current = root
        for name in ["cases", "T1"]:
            child = os.open(name, FLAGS, dir_fd=current)
            opened.append(child)
            s = os.fstat(child)
            if (
                s.st_uid != uid
                or s.st_dev != root_stat.st_dev
                or stat.S_IMODE(s.st_mode) != 0o700
            ):
                raise RuntimeError("p6 private ancestry drift")
            current = child
        for name, inode in RAW_IDS.items():
            fd = os.open(name, FLAGS, dir_fd=current)
            opened.append(fd)
            s = os.fstat(fd)
            if (
                s.st_ino != inode
                or s.st_dev != root_stat.st_dev
                or s.st_uid != uid
                or stat.S_IMODE(s.st_mode) != 0o700
            ):
                raise RuntimeError("p6 raw directory identity drift")
        archive_stat = os.lstat(ARCHIVE)
        if (
            not stat.S_ISDIR(archive_stat.st_mode)
            or archive_stat.st_uid != uid
            or stat.S_IMODE(archive_stat.st_mode) != 0o700
        ):
            raise RuntimeError("archive identity rejected")
        verify_archive(review, uid)
        preflight = [0]
        for fd in opened[-3:]:
            inspect_tree(fd, uid, root_stat.st_dev, preflight)
        now = lambda: datetime.now(timezone.utc).isoformat()
        exclusive_receipt(
            "p6-raw-history-cleanup-intent.json",
            {
                "schema": "appraise.m02-successful-history-cleanup-intent/v1",
                "at": now(),
                "root": ROOT,
                "rootIdentity": list(ROOT_ID),
                "reviewSha256": REVIEW_SHA,
                "onlyRelativePaths": ["cases/T1/" + name for name in RAW_IDS],
                "unknownRootsAuthorized": False,
                "rawContentsRead": False,
            },
        )
        counts = {"entries": 0, "files": 0, "directories": 0, "symlinks": 0}
        for name, fd in zip(RAW_IDS, opened[-3:]):
            erase_contents(fd, uid, root_stat.st_dev, counts)
            if os.listdir(fd):
                raise RuntimeError("raw directory not empty")
            os.rmdir(name, dir_fd=current)
        os.fsync(current)
        verify_archive(review, uid)
        exclusive_receipt(
            "p6-raw-history-cleanup-result.json",
            {
                "schema": "appraise.m02-successful-history-cleanup-result/v1",
                "at": now(),
                "status": "SUCCESSFUL_P6_RAW_HISTORY_REMOVED",
                "root": ROOT,
                "counts": counts,
                "safeArchivePreserved": True,
                "unknownRootsTouched": False,
                "rawContentsRead": False,
                "retentionDeadline": "2026-10-17T15:12:30.288Z",
            },
        )
        print(
            json.dumps(
                {"status": "SUCCESSFUL_P6_RAW_HISTORY_REMOVED", "counts": counts}
            )
        )
    finally:
        for fd in reversed(opened):
            os.close(fd)
        os.close(root)


if __name__ == "__main__":
    main()
