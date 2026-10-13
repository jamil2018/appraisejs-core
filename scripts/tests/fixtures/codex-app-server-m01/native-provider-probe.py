"""Authorized disposable native probe. Never imports ambient auth or retries a start."""

import argparse
import hashlib
import json
import os
import pathlib
import selectors
import stat
import subprocess
import tempfile
import time

BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
BINARY_SHA = "0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28"
CONTRACT_SHA = "1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133"
TASK = pathlib.Path(__file__).resolve().parents[4] / "tasks/codex-app-server-journeys"
FLAGS = [
    "plugins",
    "apps",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "goals",
    "hooks",
    "image_generation",
    "memories",
    "multi_agent",
    "plugin_sharing",
    "remote_plugin",
    "shell_tool",
    "skill_mcp_dependency_install",
    "skill_search",
    "sleep_tool",
    "unified_exec",
    "view_image",
    "workspace_dependencies",
    "code_mode",
]
CONFIG = (
    """model="gpt-6.1-sol"
model_reasoning_effort="medium"
model_provider="openai"
approval_policy="never"
sandbox_mode="read-only"
cli_auth_credentials_store="file"
mcp_oauth_credentials_store="file"
web_search="disabled"
[shell_environment_policy]
inherit="none"
[features]
"""
    + "\n".join(f"{name}=false" for name in FLAGS)
    + """
[analytics]
enabled=false
"""
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")
    path.chmod(0o600)


def preflight():
    if digest(pathlib.Path(BINARY).read_bytes()) != BINARY_SHA:
        raise RuntimeError("binary pin changed")
    if digest((TASK / "m00-host-authority-contract.md").read_bytes()) != CONTRACT_SHA:
        raise RuntimeError("approved contract changed")
    if pathlib.Path("/etc/codex/config.toml").exists():
        raise RuntimeError("ambient system config exists")
    host = (
        subprocess.check_output(["/usr/bin/sw_vers", "-productVersion"])
        .decode()
        .strip()
    )
    build = (
        subprocess.check_output(["/usr/bin/sw_vers", "-buildVersion"]).decode().strip()
    )
    arch = subprocess.check_output(["/usr/bin/uname", "-m"]).decode().strip()
    if (host, build, arch) != ("27.0.1", "26A434", "arm64"):
        raise RuntimeError("host tuple changed")


def environment(root):
    return {
        "HOME": str(root / "home"),
        "CODEX_HOME": str(root / "codex"),
        "TMPDIR": str(root / "tmp"),
        "PATH": "/usr/bin:/bin",
        "LANG": "C",
        "RUST_LOG": "off",
    }


def receipt(root):
    if root.is_symlink() or not root.name.startswith("appraise-m01-native-"):
        raise RuntimeError("unowned state path")
    if any(
        (root / name).is_symlink() for name in ["home", "codex", "workspace", "tmp"]
    ):
        raise RuntimeError("symlinked state directory")
    r = json.loads((root / "receipt.json").read_text())
    if r["sourceSha256"] != digest(pathlib.Path(__file__).read_bytes()):
        raise RuntimeError("runner source changed since preparation")
    if r["stateId"] != root.name or r["binarySha256"] != BINARY_SHA:
        raise RuntimeError("unowned or mismatched state")
    if digest((root / "codex/config.toml").read_bytes()) != digest(CONFIG.encode()):
        raise RuntimeError("config changed")
    return r


def prepare():
    root = pathlib.Path(
        tempfile.mkdtemp(prefix="appraise-m01-native-", dir="/private/tmp")
    )
    for name in ["home", "codex", "workspace", "tmp"]:
        (root / name).mkdir(mode=0o700)
    (root / "codex/config.toml").write_text(CONFIG)
    (root / "codex/config.toml").chmod(0o600)
    save(
        root / "receipt.json",
        {
            "stateId": root.name,
            "binarySha256": BINARY_SHA,
            "configSha256": digest(CONFIG.encode()),
            "probeDocumentSha256": digest(
                (TASK / "m01-remaining-probe.md").read_bytes()
            ),
            "sourceSha256": digest(pathlib.Path(__file__).read_bytes()),
            "authenticationPolicy": "check-only; Codex owns sign-in",
            "probeStarted": False,
            "turnStarts": 0,
            "m01Complete": False,
        },
    )
    schemas = root / "schemas"
    subprocess.run(
        [BINARY, "app-server", "generate-json-schema", "--out", str(schemas)],
        env=environment(root),
        cwd=root / "workspace",
        capture_output=True,
        check=True,
    )
    files = [
        {"file": str(p.relative_to(schemas)), "sha256": digest(p.read_bytes())}
        for p in sorted(schemas.rglob("*.json"))
    ]
    pin = json.loads((TASK / "m01/schema-pin.json").read_text())
    if (
        digest(json.dumps(files, separators=(",", ":")).encode())
        != pin["manifestSha256"]
    ):
        raise RuntimeError("schema pin changed")
    print(
        json.dumps(
            {
                "stateRoot": str(root),
                "schemaPinVerified": True,
                "configSha256": digest(CONFIG.encode()),
            }
        )
    )


class Connection:
    def __init__(self, root, evidence):
        self.root = root
        self.evidence = evidence
        self.closed = False
        self.turn_deadline = None
        evidence["processStarts"] = evidence.get("processStarts", 0) + 1
        self.generation = evidence["processStarts"]
        with (root / "intents.jsonl").open("a") as intent_file:
            intent_file.write(
                json.dumps(
                    {
                        "method": "owned-process-launch",
                        "transportGeneration": self.generation,
                    }
                )
                + "\n"
            )
            intent_file.flush()
            os.fsync(intent_file.fileno())
        self.process = subprocess.Popen(
            [BINARY, "app-server", "--listen", "stdio://", "--strict-config"],
            cwd=root / "workspace",
            env=environment(root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.buffer = b""
        self.frames = []
        self.next_id = 0
        self.drop_id = None
        self.thread_id = None

    def send(self, method, params=None):
        self.next_id += 1
        frame = {"id": self.next_id, "method": method, "params": params or {}}
        intent = {
            "id": self.next_id,
            "transportGeneration": self.generation,
            "method": method,
            "paramsSha256": digest(json.dumps(params, sort_keys=True).encode()),
            "atUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        with (self.root / "intents.jsonl").open("a") as f:
            f.write(json.dumps(intent) + "\n")
            f.flush()
            os.fsync(f.fileno())
        self.process.stdin.write((json.dumps(frame) + "\n").encode())
        self.process.stdin.flush()
        return self.next_id

    def frame(self, frame):
        if frame.get("id") == self.drop_id and "method" not in frame:
            self.evidence["withheldAcknowledgements"] += 1
            return
        if "id" in frame and "method" in frame:
            self.process.stdin.write(
                (
                    json.dumps(
                        {
                            "id": frame["id"],
                            "error": {
                                "code": -32601,
                                "message": "unsupported probe request",
                            },
                        }
                    )
                    + "\n"
                ).encode()
            )
            self.process.stdin.flush()
            raise RuntimeError("unexpected server request; park")
        method = frame.get("method")
        params = frame.get("params", {})
        if method == "error":
            raise RuntimeError("provider error notification; park")
        if method in ("item/started", "item/completed"):
            kind = params.get("item", {}).get("type")
            if kind not in (
                "userMessage",
                "agentMessage",
                "reasoning",
                "contextCompaction",
            ):
                raise RuntimeError("unexpected native item/activity; park")
        if method in ("turn/started", "turn/completed", "item/agentMessage/delta"):
            turn_id = params.get("turnId", params.get("turn", {}).get("id"))
            if params.get("threadId") != self.thread_id:
                raise RuntimeError("foreign turn event; park")
            event = {
                "method": method,
                "threadId": self.thread_id,
                "turnId": turn_id,
                "status": params.get("turn", {}).get("status"),
            }
            self.evidence["events"].append(event)
        if method == "thread/tokenUsage/updated":
            total = params.get("tokenUsage", {}).get("total", {})
            self.evidence["usage"] = {
                k: total[k] for k in total if k.endswith("Tokens")
            }
        # Response bodies remain in process memory only for correlation; no transcript export.
        self.frames.append(frame)

    def wait(self, predicate, seconds=60):
        for previous in self.frames:
            if predicate(previous):
                return previous
        deadline = time.monotonic() + seconds
        if self.turn_deadline is not None:
            deadline = min(deadline, self.turn_deadline)
        while time.monotonic() < deadline:
            while b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                frame = json.loads(line)
                self.frame(frame)
                if predicate(frame):
                    return frame
            for _, _mask in self.selector.select(0.1):
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError("transport closed; park")
                self.buffer += chunk
                if len(self.buffer) > 1048576:
                    raise RuntimeError("oversized protocol frame; park")
        raise TimeoutError("ack/observation deadline; park")

    def rpc(self, method, params=None):
        request_id = self.send(method, params)
        response = self.wait(lambda f: f.get("id") == request_id and "method" not in f)
        if "error" in response:
            raise RuntimeError(f"RPC rejected: {method}; park")
        return response["result"]

    def initialize(self, require_auth=True):
        response = self.rpc(
            "initialize",
            {
                "clientInfo": {"name": "appraise_m01_native", "version": "0.1"},
                "capabilities": {
                    "experimentalApi": False,
                    "explicitGatewayOauth": True,
                    "requestAttestation": False,
                },
            },
        )
        if response["codexHome"] != str(self.root / "codex"):
            raise RuntimeError("provider state mismatch")
        self.evidence["userAgent"] = response["userAgent"]
        self.process.stdin.write(b'{"method":"initialized"}\n')
        self.process.stdin.flush()
        effective = self.rpc(
            "config/read", {"includeLayers": True, "cwd": str(self.root / "workspace")}
        )
        for layer in effective["layers"]:
            own = layer["name"]["type"] == "user" and layer["name"]["file"] == str(
                self.root / "codex/config.toml"
            )
            empty_system = layer["name"]["type"] == "system" and not layer["config"]
            if not own and not empty_system:
                raise RuntimeError("unknown configuration layer")
        if effective["config"]["model_provider"] != "openai":
            raise RuntimeError("native provider binding mismatch")
        normalized = json.dumps(effective["config"], sort_keys=True).replace(
            str(self.root), "<owned-state>"
        )
        self.evidence["effectiveConfigSha256"] = digest(normalized.encode())
        account = self.rpc("account/read", {"refreshToken": False})
        account_type = (account.get("account") or {}).get("type")
        if require_auth and account_type != "chatgpt":
            raise RuntimeError(
                "AUTHENTICATION_REQUIRED: selected Codex state has no native ChatGPT login"
            )
        self.evidence["accountType"] = account_type

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.process.stdin.close()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.evidence["processExits"].append(self.process.returncode)
        self.selector.close()


def shared(root):
    return {
        "cwd": str(root / "workspace"),
        "model": "gpt-6.1-sol",
        "modelProvider": "openai",
        "sandbox": "read-only",
        "approvalPolicy": "never",
    }


def start_turn(connection, root, r, text):
    if r["turnStarts"] >= 3:
        raise RuntimeError("three-start limit reached")
    connection.turn_deadline = time.monotonic() + 60
    r["turnStarts"] += 1
    save(root / "receipt.json", r)
    return connection.send(
        "turn/start",
        {
            "threadId": connection.thread_id,
            "model": "gpt-6.1-sol",
            "effort": "medium",
            "input": [{"type": "text", "text": text, "text_elements": []}],
        },
    )


def terminal(connection, turn_id):
    frame = connection.wait(
        lambda f: (
            f.get("method") == "turn/completed" and f["params"]["turn"]["id"] == turn_id
        )
    )
    return frame["params"]["turn"]["status"]


def probe(root):
    r = receipt(root)
    if r["probeStarted"]:
        raise RuntimeError("probe already started; do not redispatch")
    if not (root / "codex/auth.json").exists():
        raise RuntimeError(
            "AUTHENTICATION_REQUIRED: selected isolated Codex state is not logged in"
        )
    if stat.S_IMODE((root / "codex/auth.json").stat().st_mode) & 0o077:
        raise RuntimeError("credential file permissions are not private")
    r["probeStarted"] = True
    save(root / "receipt.json", r)
    e = {
        "evidenceClass": "native-provider-observation",
        "stateId": root.name,
        "binarySha256": BINARY_SHA,
        "configSha256": digest(CONFIG.encode()),
        "events": [],
        "processExits": [],
        "withheldAcknowledgements": 0,
        "m01Complete": False,
        "nativeHistoryRetained": True,
        "nativeTransportPolicy": "built-in defaults, explicitly authorized",
        "supervisorStartResends": 0,
    }
    connection = Connection(root, e)
    try:
        connection.initialize()
        started = connection.rpc("thread/start", shared(root))
        if started["modelProvider"] != "openai":
            raise RuntimeError("thread provider differs")
        connection.thread_id = started["thread"]["id"]
        e["threadId"] = connection.thread_id
        text = "Reply exactly M01-PROTOCOL-OK. Do not use tools, browse, read files or perform actions."
        request_id = start_turn(connection, root, r, text)
        ack = connection.wait(lambda f: f.get("id") == request_id and "method" not in f)
        if "error" in ack:
            raise RuntimeError("turn start rejected; park")
        e["firstTurnStatus"] = terminal(connection, ack["result"]["turn"]["id"])
        if e["firstTurnStatus"] != "completed":
            raise RuntimeError("first turn did not complete; park")
        connection.close()
        connection = Connection(root, e)
        connection.initialize()
        connection.thread_id = e["threadId"]
        resumed = connection.rpc(
            "thread/resume", {**shared(root), "threadId": e["threadId"]}
        )
        e["restartResumeMatches"] = resumed["thread"]["id"] == e["threadId"]
        request_id = start_turn(
            connection,
            root,
            r,
            "Print the integers from 1 to 1000 as plain text. Do not use tools or perform actions.",
        )
        ack = connection.wait(lambda f: f.get("id") == request_id and "method" not in f)
        if "error" in ack:
            raise RuntimeError("interrupt turn start rejected; park")
        turn_id = ack["result"]["turn"]["id"]
        already_started = any(
            f.get("method") == "turn/started" and f["params"]["turn"]["id"] == turn_id
            for f in connection.frames
        )
        if not already_started:
            connection.wait(
                lambda f: (
                    f.get("method") == "turn/started"
                    and f["params"]["turn"]["id"] == turn_id
                )
            )
        connection.rpc("turn/interrupt", {"threadId": e["threadId"], "turnId": turn_id})
        e["interruptedStatus"] = terminal(connection, turn_id)
        if e["interruptedStatus"] != "interrupted":
            raise RuntimeError("interrupt race; park without extra turn")
        connection.drop_id = start_turn(connection, root, r, text)
        try:
            connection.wait(lambda _f: False)
        except TimeoutError:
            e["lostStartClassification"] = "UNKNOWN"
        connection.close()
        connection = Connection(root, e)
        connection.initialize()
        connection.thread_id = e["threadId"]
        connection.rpc("thread/resume", {**shared(root), "threadId": e["threadId"]})
        history = connection.rpc(
            "thread/read", {"threadId": e["threadId"], "includeTurns": True}
        )
        e["persistedTurns"] = [
            {"id": t["id"], "status": t["status"]}
            for t in history["thread"].get("turns", [])
        ]
        e["noAutomaticResend"] = True
    except (RuntimeError, TimeoutError, KeyError, ValueError, OSError) as error:
        e["parkedReason"] = str(error)
    finally:
        connection.close()
        e["turnStarts"] = r["turnStarts"]
        e["generatedAtUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save(root / "observation.json", e)
        print(
            json.dumps(
                {
                    "stateRoot": str(root),
                    "turnStarts": e["turnStarts"],
                    "parkedReason": e.get("parkedReason"),
                    "observation": str(root / "observation.json"),
                }
            )
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "check", "probe"])
    parser.add_argument("root", nargs="?", type=pathlib.Path)
    args = parser.parse_args()
    preflight()
    if args.mode == "prepare":
        prepare()
    else:
        if args.root is None or args.root.parent != pathlib.Path("/private/tmp"):
            raise RuntimeError("explicit owned /private/tmp state required")
        if args.mode == "check":
            receipt(args.root)
            e = {"processExits": []}
            connection = Connection(args.root, e)
            try:
                connection.initialize()
                e["status"] = "AUTHENTICATED"
            except RuntimeError as error:
                e["status"] = str(error)
            finally:
                connection.close()
            save(args.root / "configuration-observation.json", e)
            print(json.dumps(e))
            if e.get("status") != "AUTHENTICATED":
                raise SystemExit(2)
        else:
            probe(args.root)


if __name__ == "__main__":
    main()
