"""Disposable loopback Responses fixture; no real model/provider inference or credentials."""

import hashlib
import json
import pathlib
import selectors
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
assert not pathlib.Path("/etc/codex/config.toml").exists()
assert (
    hashlib.sha256(pathlib.Path(BINARY).read_bytes()).hexdigest()
    == "0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28"
)
root = pathlib.Path(tempfile.mkdtemp(prefix="appraise-m01-stream-", dir="/private/tmp"))
for part in ["home", "codex", "workspace", "tmp"]:
    (root / part).mkdir()
drop_id = None
dropped_ack_count = 0
requests = []
fixture_mode = "complete"
fixture_call_sent = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global fixture_call_sent
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        requests.append(
            {
                "path": self.path,
                "model": data.get("model"),
                "authorizationPresent": bool(self.headers.get("Authorization")),
            }
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        item = {
            "id": "m01-message",
            "type": "message",
            "role": "assistant",
            "status": "completed",
            "content": [
                {"type": "output_text", "text": "M01-FIXTURE-OK", "annotations": []}
            ],
        }
        events = [
            {
                "type": "response.created",
                "response": {
                    "id": "m01-response",
                    "object": "response",
                    "status": "in_progress",
                },
            },
            {
                "type": "response.output_item.added",
                "output_index": 0,
                "item": dict(item, status="in_progress", content=[]),
            },
            {
                "type": "response.output_text.delta",
                "output_index": 0,
                "content_index": 0,
                "item_id": item["id"],
                "delta": "M01-FIXTURE-OK",
            },
            {"type": "response.output_item.done", "output_index": 0, "item": item},
            {
                "type": "response.completed",
                "response": {
                    "id": "m01-response",
                    "object": "response",
                    "status": "completed",
                    "output": [item],
                    "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
                },
            },
        ]
        if fixture_mode == "request" and not fixture_call_sent:
            fixture_call_sent = True
            tool = {
                "id": "m01-call",
                "type": "function_call",
                "call_id": "m01-call",
                "name": "m01_request",
                "arguments": "{}",
                "status": "completed",
            }
            events = [
                {
                    "type": "response.created",
                    "response": {"id": "m01-response", "status": "in_progress"},
                },
                {"type": "response.output_item.done", "output_index": 0, "item": tool},
                {
                    "type": "response.completed",
                    "response": {
                        "id": "m01-response",
                        "status": "completed",
                        "output": [tool],
                    },
                },
            ]
        try:
            for event in events:
                if (
                    fixture_mode in ["hold", "request"]
                    and event["type"] == "response.completed"
                    and item in event.get("response", {}).get("output", [])
                ):
                    time.sleep(3)
                self.wfile.write(
                    (
                        "event: "
                        + event["type"]
                        + "\ndata: "
                        + json.dumps(event)
                        + "\n\n"
                    ).encode()
                )
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


try:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
except BaseException:
    shutil.rmtree(root)
    raise
threading.Thread(target=server.serve_forever, daemon=True).start()
config = f"""model="gpt-6.1-sol"
model_reasoning_effort="medium"
model_provider="m01_fixture"
approval_policy="never"
sandbox_mode="read-only"
cli_auth_credentials_store="file"
mcp_oauth_credentials_store="file"
web_search="disabled"
[shell_environment_policy]
inherit="none"
[features]
plugins=false
[analytics]
enabled=false
[model_providers.m01_fixture]
name="M01 synthetic local Responses fixture"
base_url="http://127.0.0.1:{server.server_port}/v1"
wire_api="responses"
requires_openai_auth=false
supports_websockets=false
"""
(root / "codex/config.toml").write_text(config)
env = {
    "HOME": str(root / "home"),
    "CODEX_HOME": str(root / "codex"),
    "PATH": "/usr/bin:/bin",
    "TMPDIR": str(root / "tmp"),
    "LANG": "C",
    "RUST_LOG": "off",
}
schema_dir = root / "experimental-schemas"
subprocess.run(
    [
        BINARY,
        "app-server",
        "generate-json-schema",
        "--experimental",
        "--out",
        str(schema_dir),
    ],
    env=env,
    cwd=root / "workspace",
    check=True,
    capture_output=True,
)
schema_files = [
    {
        "file": str(f.relative_to(schema_dir)),
        "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
    }
    for f in sorted(schema_dir.rglob("*.json"))
]
experimental_schema_digest = hashlib.sha256(
    json.dumps(schema_files, separators=(",", ":")).encode()
).hexdigest()
p = subprocess.Popen(
    [BINARY, "app-server", "--listen", "stdio://", "--strict-config"],
    cwd=root / "workspace",
    env=env,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
)
sel = selectors.DefaultSelector()
sel.register(p.stdout, selectors.EVENT_READ)
buffer = b""
frames = []
sent = []
next_id = 0


def send(method, params=None):
    global next_id
    next_id += 1
    f = {"id": next_id, "method": method, "params": params or {}}
    sent.append({"id": next_id, "method": method})
    p.stdin.write((json.dumps(f) + "\n").encode())
    p.stdin.flush()
    return next_id


def receive(predicate, timeout=20):
    global buffer, dropped_ack_count
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            f = json.loads(line)
            if f.get("id") == drop_id and "method" not in f:
                dropped_ack_count += 1
                continue
            frames.append(f)
            if "id" in f and "method" in f:
                report.setdefault("deniedServerRequests", []).append(
                    {"method": f["method"], "idType": type(f["id"]).__name__}
                )
                p.stdin.write(
                    (
                        json.dumps(
                            {
                                "id": f["id"],
                                "error": {
                                    "code": -32601,
                                    "message": "unsupported qualification request",
                                },
                            }
                        )
                        + "\n"
                    ).encode()
                )
                p.stdin.flush()
                send(
                    "turn/interrupt",
                    {
                        "threadId": f["params"]["threadId"],
                        "turnId": f["params"]["turnId"],
                    },
                )
            if predicate(f):
                return f
        for _, __ in sel.select(0.1):
            import os

            chunk = os.read(p.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError("closed")
            buffer += chunk
    raise TimeoutError("no matching frame")


def rpc(method, params=None):
    request = send(method, params)
    f = receive(lambda f: f.get("id") == request and not f.get("method"))
    if "error" in f:
        raise RuntimeError(json.dumps(f["error"]))
    return f["result"]


report = {}
try:
    report["initialize"] = rpc(
        "initialize",
        {
            "clientInfo": {"name": "appraise_m01_fixture", "version": "0.1"},
            "capabilities": {
                "experimentalApi": True,
                "requestAttestation": False,
                "explicitGatewayOauth": True,
            },
        },
    )
    p.stdin.write(b'{"method":"initialized"}\n')
    p.stdin.flush()
    effective = rpc(
        "config/read", {"includeLayers": True, "cwd": str(root / "workspace")}
    )
    assert effective["config"]["model_provider"] == "m01_fixture"
    for layer in effective["layers"]:
        own = layer["name"]["type"] == "user" and layer["name"]["file"] == str(
            root / "codex/config.toml"
        )
        empty = layer["name"]["type"] == "system" and not layer["config"]
        assert own or empty
    report["effectiveConfigSha256"] = hashlib.sha256(
        json.dumps(effective["config"], sort_keys=True, separators=(",", ":"))
        .replace(str(root), "<disposable-root>")
        .encode()
    ).hexdigest()
    report["systemConfigFileAbsent"] = True
    start = rpc(
        "thread/start",
        {
            "cwd": str(root / "workspace"),
            "modelProvider": "m01_fixture",
            "sandbox": "read-only",
            "approvalPolicy": "never",
            "dynamicTools": [
                {
                    "type": "function",
                    "name": "m01_request",
                    "description": "Synthetic qualification request; no effect",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                }
            ],
        },
    )
    thread_id = start["thread"]["id"]
    report["threadId"] = thread_id
    turn = rpc(
        "turn/start",
        {
            "threadId": thread_id,
            "input": [
                {
                    "type": "text",
                    "text": "Synthetic fixture only; do not run tools.",
                    "text_elements": [],
                }
            ],
            "model": "gpt-6.1-sol",
            "effort": "medium",
        },
    )
    report["turnId"] = turn["turn"]["id"]
    terminal = receive(lambda f: f.get("method") == "turn/completed")
    report["terminal"] = terminal["params"]["turn"]["status"]
    resume = rpc(
        "thread/resume",
        {
            "threadId": thread_id,
            "model": "gpt-6.1-sol",
            "modelProvider": "m01_fixture",
            "cwd": str(root / "workspace"),
            "sandbox": "read-only",
            "approvalPolicy": "never",
        },
    )
    report["resumeMatches"] = resume["thread"]["id"] == thread_id
    fixture_mode = "hold"
    interrupted = rpc(
        "turn/start",
        {
            "threadId": thread_id,
            "input": [
                {
                    "type": "text",
                    "text": "Synthetic interrupt fixture",
                    "text_elements": [],
                }
            ],
            "model": "gpt-6.1-sol",
            "effort": "medium",
        },
    )
    if not any(
        f.get("method") == "turn/started"
        and f["params"]["turn"]["id"] == interrupted["turn"]["id"]
        for f in frames
    ):
        receive(
            lambda f: (
                f.get("method") == "turn/started"
                and f["params"]["turn"]["id"] == interrupted["turn"]["id"]
            )
        )
    interrupt = rpc(
        "turn/interrupt", {"threadId": thread_id, "turnId": interrupted["turn"]["id"]}
    )
    report["interruptAcknowledged"] = interrupt == {}
    interrupted_terminal = receive(lambda f: f.get("method") == "turn/completed")
    report["interruptedStatus"] = interrupted_terminal["params"]["turn"]["status"]
    fixture_mode = "request"
    lost_ack_id = send(
        "turn/start",
        {
            "threadId": thread_id,
            "input": [
                {
                    "type": "text",
                    "text": "Synthetic unsupported request fixture",
                    "text_elements": [],
                }
            ],
            "model": "gpt-6.1-sol",
            "effort": "medium",
        },
    )
    drop_id = lost_ack_id
    terminal = receive(lambda f: f.get("method") == "turn/completed")
    report["lastTurnStatus"] = terminal["params"]["turn"]["status"]
    report["lostTurnAckDropped"] = dropped_ack_count
    report["unknownStartBeforeReconciliation"] = True
    report["turnStartCount"] = len([f for f in sent if f["method"] == "turn/start"])
    report["automaticResend"] = False
    # Capture the persisted thread through a new owned process, with no new turn.
    p.stdin.close()
    p.wait(timeout=5)
    sel.close()
    p = subprocess.Popen(
        [BINARY, "app-server", "--listen", "stdio://", "--strict-config"],
        cwd=root / "workspace",
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    sel = selectors.DefaultSelector()
    sel.register(p.stdout, selectors.EVENT_READ)
    buffer = b""
    rpc(
        "initialize",
        {
            "clientInfo": {"name": "appraise_m01_fixture", "version": "0.1"},
            "capabilities": {
                "experimentalApi": True,
                "requestAttestation": False,
                "explicitGatewayOauth": True,
            },
        },
    )
    p.stdin.write(b'{"method":"initialized"}\n')
    p.stdin.flush()
    resumed = rpc(
        "thread/resume",
        {
            "threadId": thread_id,
            "model": "gpt-6.1-sol",
            "modelProvider": "m01_fixture",
            "cwd": str(root / "workspace"),
            "sandbox": "read-only",
            "approvalPolicy": "never",
        },
    )
    report["restartResumeMatches"] = resumed["thread"]["id"] == thread_id
except (RuntimeError, TimeoutError, KeyError, ValueError, AssertionError, OSError) as e:
    report["error"] = str(e)
finally:
    p.stdin.close()
    try:
        p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()
    server.shutdown()
    server.server_close()
    sel.close()
    report["exitCode"] = p.returncode
    report["methods"] = [f.get("method") for f in frames if f.get("method")]
    report["correlatedEvents"] = [
        {
            "method": f["method"],
            "threadId": f["params"]["threadId"],
            "turnId": f["params"].get("turnId", f["params"].get("turn", {}).get("id")),
        }
        for f in frames
        if f.get("method")
        in ["turn/started", "turn/completed", "item/agentMessage/delta"]
    ]
    report["sent"] = sent
    report["syntheticHttpRequests"] = requests
    report["configTemplate"] = config.replace(
        str(server.server_port), "<loopback-port>"
    )
    report["noProviderInference"] = True
    report["initialize"] = json.loads(
        json.dumps(report.get("initialize", {})).replace(str(root), "<disposable-root>")
    )
    shutil.rmtree(root)
    report["evidenceClass"] = "live-binary-synthetic-responses"
    report["experimentalSchemaManifestSha256"] = experimental_schema_digest
    report["experimentalSchemaFileCount"] = len(schema_files)
    report["capabilities"] = {
        "experimentalApi": True,
        "requestAttestation": False,
        "explicitGatewayOauth": True,
    }
    report["configSha256"] = hashlib.sha256(config.encode()).hexdigest()
    report["configTemplateSha256"] = hashlib.sha256(
        report["configTemplate"].encode()
    ).hexdigest()
    report["sourceSha256"] = hashlib.sha256(
        pathlib.Path(__file__).read_bytes()
    ).hexdigest()
    report["pin"] = {
        "binarySha256": hashlib.sha256(pathlib.Path(BINARY).read_bytes()).hexdigest(),
        "os": subprocess.check_output(["/usr/bin/sw_vers", "-productVersion"])
        .decode()
        .strip(),
        "build": subprocess.check_output(["/usr/bin/sw_vers", "-buildVersion"])
        .decode()
        .strip(),
        "architecture": subprocess.check_output(["/usr/bin/uname", "-m"])
        .decode()
        .strip(),
    }
    report["disposableStateDeleted"] = True
    report["m01Complete"] = False
    report["providerInferenceAuthorized"] = False
    report["generatedAtUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pathlib.Path("/private/tmp/appraise-m01-stream-observation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps(report))
