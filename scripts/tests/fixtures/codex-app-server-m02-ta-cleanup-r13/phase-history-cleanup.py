"""One-shot, reviewed T2/T3 provider-local raw-history cleanup.

This module does not build or approve a retention plan. Its CLI has no path override.
Importing it has no filesystem effect. A pre-existing intent consumes the command,
including when deletion or result-writing was interrupted.

Derived from accepted r12 source SHA-256
f8c86f3e278716590418573c512a369b7c8cacf0b577a668078a94d0fb92a23e.
Only the pinned source manifest receives the 4 MiB read ceiling.
"""

import hashlib
import json
import os
import re
import stat
import sys
from datetime import datetime, timezone

REPO = "/Users/jamil/Personal Projects/appraisejs"
ROOTS = {
    "T2": "/private/tmp/appraise-m02-ta-matrix-p3",
    "T3": "/private/tmp/appraise-m02-ta-workspace-p1",
}
T2_CASES = tuple(
    [f"B0{i}" for i in range(1, 7)]
    + [f"B07-A{i:02}" for i in range(1, 15)]
    + ["B07-D01", "B07-T01", "P00", "B14"]
)
CASES = {"T2": T2_CASES, "T3": ("N01", "N02")}
RAW = ("home", "codex", "tmp")
HEX = re.compile(r"[0-9a-f]{64}\Z")
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW
MAX_PIN_BYTES = 1024 * 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_PLAN_BYTES = 256 * 1024
MAX_ENTRIES = 10000
MAX_DEPTH = 24
MAX_PIN_TOTAL_BYTES = 64 * 1024 * 1024


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _require(condition, message):
    if not condition:
        raise RuntimeError(message)


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, stat.S_IFMT(info.st_mode))


def _private_dir(info, uid, dev=None, ino=None):
    return (
        stat.S_ISDIR(info.st_mode)
        and info.st_uid == uid
        and stat.S_IMODE(info.st_mode) == 0o700
        and (dev is None or info.st_dev == dev)
        and (ino is None or info.st_ino == ino)
    )


def _open_absolute(path, flags):
    """Walk each absolute component with O_NOFOLLOW; caller owns returned FD."""
    _require(
        isinstance(path, str) and path.startswith("/") and "//" not in path,
        "absolute path required",
    )
    parts = path.split("/")[1:]
    _require(
        all(part not in ("", ".", "..") for part in parts), "path component rejected"
    )
    fd = os.open("/", DIR_FLAGS)
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        leaf = os.open(parts[-1], flags, dir_fd=fd)
        return fd, leaf, parts[-1]
    except BaseException:
        os.close(fd)
        raise


def _read_owned_file(path, expected_sha, uid, ceiling=MAX_PIN_BYTES):
    _require(
        isinstance(expected_sha, str) and HEX.fullmatch(expected_sha),
        "file digest rejected",
    )
    parent, fd, name = _open_absolute(path, FILE_FLAGS)
    try:
        before = os.fstat(fd)
        _require(
            stat.S_ISREG(before.st_mode)
            and before.st_uid == uid
            and before.st_nlink == 1
            and stat.S_IMODE(before.st_mode) == 0o600
            and before.st_size <= ceiling,
            "pinned file metadata rejected",
        )
        raw = os.read(fd, ceiling + 1)
        _require(
            len(raw) == before.st_size and _sha(raw) == expected_sha,
            "pinned file bytes drift",
        )
        after = os.fstat(fd)
        current = os.stat(name, dir_fd=parent, follow_symlinks=False)
        _require(
            _identity(before) == _identity(after) == _identity(current),
            "pinned file identity drift",
        )
        _require(
            before.st_size == after.st_size == current.st_size,
            "pinned file length drift",
        )
        _require(
            all(
                item.st_nlink == 1 and stat.S_IMODE(item.st_mode) == 0o600
                for item in (after, current)
            ),
            "pinned file metadata drift",
        )
        return raw
    finally:
        os.close(fd)
        os.close(parent)


def _layout(phase, test_layout=None):
    _require(phase in ROOTS, "phase rejected")
    if test_layout is None:
        repo, root = REPO, ROOTS[phase]
    else:
        # Only the directly imported unit API can inject a disposable root.
        _require(
            isinstance(test_layout, dict) and set(test_layout) == {"repo", "root"},
            "test layout rejected",
        )
        repo, root = test_layout["repo"], test_layout["root"]
    stem = f"m02-ta-{phase.lower()}-retention"
    return {
        "repo": repo,
        "root": root,
        "plan": f"{repo}/.appraisejs/{stem}-build-r13/manifest.json",
        "evidence": f"{repo}/.appraisejs/{stem}-evidence-r13",
    }


def _check_plan(plan, phase, layout):
    _require(
        isinstance(plan, dict)
        and plan.get("schema") == "appraise.m02-ta-retention-plan/v1",
        "plan schema",
    )
    _require(
        plan.get("phase") == phase and plan.get("root") == layout["root"],
        "plan phase/root",
    )
    root_id = plan.get("rootIdentity")
    _require(
        isinstance(root_id, dict) and set(root_id) == {"dev", "ino", "uid"},
        "root identity pin",
    )
    _require(
        all(type(root_id[k]) is int and root_id[k] >= 0 for k in root_id),
        "root identity values",
    )
    journal = plan.get("journalSha256")
    _require(isinstance(journal, str) and HEX.fullmatch(journal), "journal pin")
    cases = plan.get("cases")
    _require(isinstance(cases, list) and len(cases) == len(CASES[phase]), "case count")
    names = [case.get("caseId") for case in cases if isinstance(case, dict)]
    _require(names == list(CASES[phase]), "case IDs")
    for case in cases:
        _require(
            set(case) == {"caseId", "finishHash", "witnessSha256", "raw"},
            "case plan fields",
        )
        _require(
            all(
                isinstance(case[k], str) and HEX.fullmatch(case[k])
                for k in ("finishHash", "witnessSha256")
            ),
            "case hashes",
        )
        raw = case["raw"]
        _require(isinstance(raw, dict) and set(raw) == set(RAW), "raw tree set")
        for name in RAW:
            item = raw[name]
            _require(
                isinstance(item, dict) and set(item) == {"dev", "ino"},
                "raw identity pin",
            )
            _require(
                all(type(item[k]) is int and item[k] >= 0 for k in item),
                "raw identity values",
            )
    pins = plan.get("pins")
    _require(
        isinstance(pins, dict)
        and set(pins) == {"manifest", "actualReview", "safeIndex", "safeArtifacts"},
        "pin set",
    )
    artifacts = pins["safeArtifacts"]
    _require(
        isinstance(artifacts, list) and artifacts and len(artifacts) <= 1000,
        "safe artifact pins",
    )
    all_pins = [pins["manifest"], pins["actualReview"], pins["safeIndex"], *artifacts]
    paths = []
    for item in all_pins:
        _require(
            isinstance(item, dict) and set(item) == {"path", "sha256"}, "pin shape"
        )
        relative, digest = item["path"], item["sha256"]
        _require(
            isinstance(relative, str)
            and relative.startswith(".appraisejs/")
            and all(part not in ("", ".", "..") for part in relative.split("/"))
            and isinstance(digest, str)
            and HEX.fullmatch(digest),
            "pin path/digest",
        )
        paths.append(relative)
    _require(len(set(paths)) == len(paths), "duplicate pin")
    _require(paths[2].endswith("/index.json"), "safe index pin")
    archive_prefix = paths[2].removesuffix("index.json")
    _require(
        archive_prefix.startswith(f".appraisejs/m02-ta-{phase.lower()}-")
        and "-execution-evidence-" in archive_prefix
        and all(
            path.startswith(archive_prefix) and path != paths[2] for path in paths[3:]
        ),
        "safe archive boundary",
    )
    _require(
        paths[1].startswith(f".appraisejs/m02-{phase.lower()}-")
        and "review" in paths[1],
        "actual review pin",
    )
    if phase == "T2":
        _require(
            paths[1] == ".appraisejs/m02-t2-r13-execution-review-01.json"
            and paths[2]
            == ".appraisejs/m02-ta-t2-r13-execution-evidence-01/index.json",
            "T2 actual review/archive pins",
        )
    _require(paths[0].endswith("/manifest.json"), "source manifest pin")
    return all_pins


def _journal_finishes(raw, cases, phase, root_id):
    expected = {case["caseId"]: case for case in cases}
    finished = {}
    finish_order = []
    active = None
    previous = "0" * 64
    lines = raw.splitlines()
    _require(lines and len(lines) <= MAX_ENTRIES, "journal length")
    for sequence, line in enumerate(lines, 1):
        item = json.loads(line)
        _require(
            isinstance(item, dict)
            and set(item) == {"seq", "previous", "event", "hash"},
            "journal line",
        )
        _require(
            item["seq"] == sequence and item["previous"] == previous, "journal chain"
        )
        body = {key: item[key] for key in ("seq", "previous", "event")}
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        _require(_sha(encoded) == item["hash"], "journal line hash")
        previous = item["hash"]
        event = item["event"]
        _require(
            isinstance(event, dict)
            and event.get("type") not in ("unknown", "recovery"),
            "uncertain journal",
        )
        if sequence == 1:
            directory = event.get("directoryIdentity")
            _require(
                event.get("type") == "init"
                and event.get("phase") == phase
                and isinstance(directory, dict)
                and directory.get("dev") == root_id["dev"]
                and directory.get("ino") == root_id["ino"],
                "journal init/root mismatch",
            )
            continue
        if event.get("type") == "begin":
            _require(
                active is None
                and len(finish_order) < len(cases)
                and event.get("caseId") == cases[len(finish_order)]["caseId"],
                "unexpected begin",
            )
            active = event["caseId"]
        elif event.get("type") == "finish":
            _require(active in expected and active not in finished, "unexpected finish")
            case = expected[active]
            _require(
                event.get("cleanupKnown") is True
                and event.get("caseWitnessSha256") == case["witnessSha256"]
                and item["hash"] == case["finishHash"],
                "finish evidence mismatch",
            )
            finished[active] = item["hash"]
            finish_order.append(active)
            active = None
    _require(
        active is None
        and finish_order == [case["caseId"] for case in cases]
        and json.loads(lines[-1])["event"].get("type") == "checkpoint",
        "incomplete terminal checkpoint",
    )
    return {
        "terminalHash": previous,
        "checkpointSeq": len(lines),
        "finishHashes": finished,
    }


def _verify_manifest(raw, plan):
    document = json.loads(raw)
    manifest = document.get("manifest") if isinstance(document, dict) else None
    _require(
        isinstance(manifest, dict)
        and manifest.get("phase") == plan["phase"]
        and manifest.get("root") == plan["root"]
        and manifest.get("cases") == list(CASES[plan["phase"]])
        and isinstance(document.get("manifestDigest"), str)
        and HEX.fullmatch(document["manifestDigest"]),
        "source manifest phase/root/cases mismatch",
    )
    return document


def _verify_actual_review(raw, plan, manifest, journal_summary):
    phase = plan["phase"]
    review = json.loads(raw)
    expected = (
        (
            "appraise.m02-ta-t2-r13-actual-review/v1",
            "ACCEPT_T2_R13_ACTUAL_WITH_LIMITS",
            "T2_CASES_COMPLETED",
        )
        if phase == "T2"
        else (
            "appraise.m02-ta-t3-actual-review/v1",
            "ACCEPT_T3_ACTUAL_WITH_LIMITS",
            "T3_CASES_COMPLETED",
        )
    )
    _require(
        isinstance(review, dict)
        and (review.get("schema"), review.get("verdict"), review.get("runtimeVerdict"))
        == expected,
        "actual review acceptance absent",
    )
    execution = review.get("execution")
    archive = review.get("archive")
    journal = review.get("journal")
    projected = [
        {key: case[key] for key in ("caseId", "finishHash", "witnessSha256")}
        for case in plan["cases"]
    ]
    _require(
        isinstance(execution, dict)
        and execution.get("root") == plan["root"]
        and isinstance(execution.get("rootIdentity"), dict)
        and all(
            execution["rootIdentity"].get(key) == value
            for key, value in plan["rootIdentity"].items()
        )
        and execution.get("manifestDigest") == manifest["manifestDigest"]
        and isinstance(archive, dict)
        and archive.get("indexSha256") == plan["pins"]["safeIndex"]["sha256"]
        and archive.get("sourceEvidenceChanged") is False
        and archive.get("sourceArchiveByteEquality") is True
        and archive.get("currentSourceIdentitiesMatch") is True
        and isinstance(journal, dict)
        and journal.get("sha256") == plan["journalSha256"]
        and journal.get("terminalHash") == journal_summary["terminalHash"]
        and journal.get("checkpointSeq") == journal_summary["checkpointSeq"]
        and journal.get("unknown") is False
        and journal.get("pending") == []
        and review.get("cases") == projected,
        "actual review evidence binding mismatch",
    )
    return review


def _verify_index(raw, plan, manifest, review):
    index = json.loads(raw)
    schema = index.get("schema") if isinstance(index, dict) else None
    schema_valid = (
        schema == "appraise.m02-ta-r13-sanitized-evidence-archive/v1"
        if plan["phase"] == "T2"
        else isinstance(schema, str)
        and re.fullmatch(r"appraise\.m02-ta-r\d+-sanitized-evidence-archive/v1", schema)
    )
    _require(
        isinstance(index, dict)
        and schema_valid
        and index.get("sourceRoot") == plan["root"]
        and index.get("outcome") == review["runtimeVerdict"]
        and index.get("manifestSha256") == plan["pins"]["manifest"]["sha256"]
        and index.get("manifestDigest") == manifest["manifestDigest"]
        and index.get("sourceEvidenceChanged") is False
        and isinstance(index.get("records"), list),
        "safe index source/outcome binding mismatch",
    )
    prefix = plan["pins"]["safeIndex"]["path"].removesuffix("index.json")
    copied = {}
    safe_sources = {}
    for record in index["records"]:
        _require(
            isinstance(record, dict) and isinstance(record.get("status"), str),
            "safe index record",
        )
        if record["status"] != "COPIED":
            continue
        name, digest = record.get("copy"), record.get("sha256")
        _require(
            isinstance(name, str)
            and name not in ("", ".", "..")
            and "/" not in name
            and isinstance(digest, str)
            and HEX.fullmatch(digest)
            and name not in copied,
            "safe index copy rejected",
        )
        copied[name] = digest
        source = record.get("source")
        if source in [
            "phase-journal.jsonl",
            *[
                f"cases/{case['caseId']}/supervisor/case-outcome.json"
                for case in plan["cases"]
            ],
        ]:
            _require(source not in safe_sources, "duplicate safe source")
            safe_sources[source] = digest
    expected = {
        item["path"].removeprefix(prefix): item["sha256"]
        for item in plan["pins"]["safeArtifacts"]
    }
    _require(copied and copied == expected, "safe copied artifacts incomplete")
    required_sources = {"phase-journal.jsonl": plan["journalSha256"]}
    required_sources.update(
        {
            f"cases/{case['caseId']}/supervisor/case-outcome.json": case[
                "witnessSha256"
            ]
            for case in plan["cases"]
        }
    )
    _require(safe_sources == required_sources, "safe archived witnesses incomplete")


def _open_private_child(parent, name, uid, dev, ino=None):
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    fd = os.open(name, DIR_FLAGS, dir_fd=parent)
    after = os.fstat(fd)
    try:
        _require(
            _identity(before) == _identity(after)
            and _private_dir(after, uid, dev, ino),
            "private directory drift",
        )
        return fd
    except BaseException:
        os.close(fd)
        raise


def _inspect_tree(fd, uid, dev, counter, inventory, prefix=(), depth=0):
    _require(depth <= MAX_DEPTH, "raw depth bound")
    for name in os.listdir(fd):
        counter[0] += 1
        _require(counter[0] <= MAX_ENTRIES, "raw entry bound")
        item = os.stat(name, dir_fd=fd, follow_symlinks=False)
        _require(item.st_uid == uid and item.st_dev == dev, "raw owner/device drift")
        key = prefix + (name,)
        inventory[key] = (_identity(item), item.st_nlink)
        if stat.S_ISDIR(item.st_mode):
            child = _open_private_child(fd, name, uid, dev, item.st_ino)
            try:
                _inspect_tree(child, uid, dev, counter, inventory, key, depth + 1)
                _require(
                    _identity(item)
                    == _identity(os.stat(name, dir_fd=fd, follow_symlinks=False)),
                    "raw directory replaced",
                )
            finally:
                os.close(child)
        elif stat.S_ISREG(item.st_mode):
            _require(item.st_nlink == 1, "raw hardlink rejected")
        elif stat.S_ISLNK(item.st_mode):
            _require(item.st_nlink == 1, "raw symlink link-count rejected")
        else:
            raise RuntimeError("raw special file rejected")


def _erase_tree(fd, uid, dev, counts, inventory, prefix=(), depth=0):
    _require(depth <= MAX_DEPTH, "raw depth bound")
    names = os.listdir(fd)
    expected = {
        key[-1]
        for key in inventory
        if len(key) == len(prefix) + 1 and key[:-1] == prefix
    }
    _require(set(names) == expected, "raw entries changed after preflight")
    for name in names:
        counts["entries"] += 1
        _require(counts["entries"] <= MAX_ENTRIES, "raw entry bound")
        before = os.stat(name, dir_fd=fd, follow_symlinks=False)
        _require(
            before.st_uid == uid and before.st_dev == dev, "raw owner/device drift"
        )
        key = prefix + (name,)
        _require(
            inventory.get(key) == (_identity(before), before.st_nlink),
            "raw entry changed after preflight",
        )
        if stat.S_ISDIR(before.st_mode):
            child = _open_private_child(fd, name, uid, dev, before.st_ino)
            try:
                _erase_tree(child, uid, dev, counts, inventory, key, depth + 1)
                _require(
                    _identity(before)
                    == _identity(os.stat(name, dir_fd=fd, follow_symlinks=False)),
                    "raw directory replaced",
                )
            finally:
                os.close(child)
            os.rmdir(name, dir_fd=fd)
            counts["directories"] += 1
        elif stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
            _require(before.st_nlink == 1, "raw hardlink rejected")
            _require(
                _identity(before)
                == _identity(os.stat(name, dir_fd=fd, follow_symlinks=False)),
                "raw entry replaced",
            )
            os.unlink(name, dir_fd=fd)
            counts["files" if stat.S_ISREG(before.st_mode) else "symlinks"] += 1
        else:
            raise RuntimeError("raw special file rejected")
    os.fsync(fd)


def _exclusive_json(directory_fd, name, value):
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd = os.open(
        name,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
        dir_fd=directory_fd,
    )
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(directory_fd)


def cleanup_once(phase, plan_sha256, *, _test_layout=None):
    """Execute a pre-reviewed exact plan once. _test_layout is for disposable unit tests only."""
    layout = _layout(phase, _test_layout)
    _require(
        isinstance(plan_sha256, str) and HEX.fullmatch(plan_sha256),
        "exact plan SHA required",
    )
    uid = os.getuid()
    plan = json.loads(
        _read_owned_file(layout["plan"], plan_sha256, uid, MAX_PLAN_BYTES)
    )
    pins = _check_plan(plan, phase, layout)
    evidence_parent, evidence_dir, _ = _open_absolute(layout["evidence"], DIR_FLAGS)
    try:
        _require(
            _private_dir(os.fstat(evidence_dir), uid),
            "cleanup evidence directory rejected",
        )
        _require(not os.listdir(evidence_dir), "cleanup evidence already consumed")
    finally:
        os.close(evidence_dir)
        os.close(evidence_parent)
    root_parent, root, root_name = _open_absolute(layout["root"], DIR_FLAGS)
    opened = []
    evidence = None
    try:
        root_stat = os.fstat(root)
        root_id = plan["rootIdentity"]
        _require(
            _private_dir(root_stat, uid, root_id["dev"], root_id["ino"])
            and root_id["uid"] == uid,
            "phase root identity drift",
        )
        cases_dir = _open_private_child(root, "cases", uid, root_stat.st_dev)
        opened.append(cases_dir)
        raw_fds = []
        case_fds = {}
        for case in plan["cases"]:
            case_id = case["caseId"]
            case_fd = _open_private_child(cases_dir, case_id, uid, root_stat.st_dev)
            opened.append(case_fd)
            case_fds[case_id] = case_fd
            for name in RAW:
                pin = case["raw"][name]
                _require(pin["dev"] == root_stat.st_dev, "raw device pin mismatch")
                fd = _open_private_child(case_fd, name, uid, pin["dev"], pin["ino"])
                opened.append(fd)
                raw_fds.append((case_id, name, case_fd, fd, pin))
        # The journal and case witnesses remain outside the three raw subtrees.
        journal = _read_owned_file(
            f"{layout['root']}/phase-journal.jsonl", plan["journalSha256"], uid
        )
        journal_summary = _journal_finishes(
            journal, plan["cases"], phase, plan["rootIdentity"]
        )
        for case in plan["cases"]:
            path = (
                f"{layout['root']}/cases/{case['caseId']}/supervisor/case-outcome.json"
            )
            witness = json.loads(_read_owned_file(path, case["witnessSha256"], uid))
            _require(
                witness.get("caseId") == case["caseId"]
                and witness.get("name") == "case-outcome"
                and witness.get("evidenceClass") == "TRUSTED_SUPERVISOR_OBSERVATION",
                "case witness rejected",
            )

        def verify_pins():
            total = 0
            for pin in pins:
                ceiling = (
                    MAX_MANIFEST_BYTES
                    if pin is plan["pins"]["manifest"]
                    else MAX_PIN_BYTES
                )
                total += len(
                    _read_owned_file(
                        f"{layout['repo']}/{pin['path']}", pin["sha256"], uid, ceiling
                    )
                )
                _require(total <= MAX_PIN_TOTAL_BYTES, "pinned archive byte bound")
            source = plan["pins"]["manifest"]
            manifest = _verify_manifest(
                _read_owned_file(
                    f"{layout['repo']}/{source['path']}",
                    source["sha256"],
                    uid,
                    MAX_MANIFEST_BYTES,
                ),
                plan,
            )
            review = plan["pins"]["actualReview"]
            accepted = _verify_actual_review(
                _read_owned_file(
                    f"{layout['repo']}/{review['path']}", review["sha256"], uid
                ),
                plan,
                manifest,
                journal_summary,
            )
            index = plan["pins"]["safeIndex"]
            _verify_index(
                _read_owned_file(
                    f"{layout['repo']}/{index['path']}", index["sha256"], uid
                ),
                plan,
                manifest,
                accepted,
            )

        verify_pins()
        counter = [0]
        inventories = {}
        for case_id, name, _, fd, _ in raw_fds:
            inventory = {}
            _inspect_tree(fd, uid, root_stat.st_dev, counter, inventory)
            inventories[(case_id, name)] = inventory
        _require(
            _identity(root_stat)
            == _identity(os.stat(root_name, dir_fd=root_parent, follow_symlinks=False))
            and _identity(os.fstat(cases_dir))
            == _identity(os.stat("cases", dir_fd=root, follow_symlinks=False)),
            "phase ancestry changed before cleanup",
        )
        # Evidence is separate from any already indexed safe archive.
        evidence_parent, evidence_dir, _ = _open_absolute(layout["evidence"], DIR_FLAGS)
        evidence = (evidence_parent, evidence_dir)
        _require(
            _private_dir(os.fstat(evidence_dir), uid),
            "cleanup evidence directory rejected",
        )
        _require(not os.listdir(evidence_dir), "cleanup evidence already consumed")
        intent = {
            "schema": "appraise.m02-ta-retention-cleanup-intent/v1",
            "phase": phase,
            "planSha256": plan_sha256,
            "rootIdentity": root_id,
            "onlyCases": [case["caseId"] for case in plan["cases"]],
            "rawEntriesPreflighted": counter[0],
            "rawContentsRead": False,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        _exclusive_json(evidence_dir, "intent.json", intent)
        counts = {"entries": 0, "files": 0, "directories": 0, "symlinks": 0}
        try:
            for case_id, name, case_fd, fd, pin in raw_fds:
                _require(
                    _private_dir(os.fstat(fd), uid, pin["dev"], pin["ino"]),
                    "raw root changed",
                )
                _erase_tree(
                    fd, uid, root_stat.st_dev, counts, inventories[(case_id, name)]
                )
                _require(not os.listdir(fd), "raw directory not empty")
                current = os.stat(name, dir_fd=case_fd, follow_symlinks=False)
                _require(
                    _identity(current) == _identity(os.fstat(fd)), "raw root replaced"
                )
                os.rmdir(name, dir_fd=case_fd)
                os.fsync(case_fd)
            verify_pins()
            _read_owned_file(
                f"{layout['root']}/phase-journal.jsonl", plan["journalSha256"], uid
            )
            for case in plan["cases"]:
                _read_owned_file(
                    f"{layout['root']}/cases/{case['caseId']}/supervisor/case-outcome.json",
                    case["witnessSha256"],
                    uid,
                )
            _require(
                _identity(root_stat)
                == _identity(
                    os.stat(root_name, dir_fd=root_parent, follow_symlinks=False)
                )
                and _private_dir(
                    os.fstat(root), uid, root_stat.st_dev, root_stat.st_ino
                ),
                "phase root changed after cleanup",
            )
            _require(
                _identity(os.fstat(cases_dir))
                == _identity(os.stat("cases", dir_fd=root, follow_symlinks=False)),
                "cases ancestor changed after cleanup",
            )
            for case_id, case_fd in case_fds.items():
                _require(
                    _identity(os.fstat(case_fd))
                    == _identity(
                        os.stat(case_id, dir_fd=cases_dir, follow_symlinks=False)
                    ),
                    "case ancestor changed after cleanup",
                )
            status = "SUCCESSFUL_CURRENT_CASES_RAW_HISTORY_REMOVED"
        except BaseException:
            _exclusive_json(
                evidence_dir,
                "result.json",
                {
                    "schema": "appraise.m02-ta-retention-cleanup-result/v1",
                    "phase": phase,
                    "planSha256": plan_sha256,
                    "status": "UNKNOWN_PARTIAL_OR_UNVERIFIED",
                    "counts": counts,
                    "at": datetime.now(timezone.utc).isoformat(),
                },
            )
            raise
        _exclusive_json(
            evidence_dir,
            "result.json",
            {
                "schema": "appraise.m02-ta-retention-cleanup-result/v1",
                "phase": phase,
                "planSha256": plan_sha256,
                "status": status,
                "counts": counts,
                "safePinsReverified": True,
                "rawContentsRead": False,
                "at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return {"status": status, "counts": counts}
    finally:
        if evidence is not None:
            os.close(evidence[1])
            os.close(evidence[0])
        for fd in reversed(opened):
            os.close(fd)
        os.close(root)
        os.close(root_parent)


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    _require(
        len(args) == 3 and args[0] == "--cleanup-once",
        "exact cleanup invocation required",
    )
    result = cleanup_once(args[1], args[2])
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
