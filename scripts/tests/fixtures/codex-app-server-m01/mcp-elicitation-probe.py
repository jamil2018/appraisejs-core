"""Pinned no-model MCP form/URL cancellation fixture; no auth or native effects."""

import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True
source = pathlib.Path(__file__).with_name("native-provider-probe.py")
spec = importlib.util.spec_from_file_location("m01_native", source)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)

STUB = r"""
import json,sys
pending=None
def send(frame):
    print(json.dumps(frame),flush=True)
def request(mode):
    params={"mode":mode,"message":"Synthetic no-effect elicitation"}
    if mode=="form":
        params["requestedSchema"]={"type":"object","properties":{"fixture":{"type":"string"}}}
    else:
        params.update(url="https://example.invalid/m01-fixture",elicitationId="m01-url")
    send({"jsonrpc":"2.0","id":mode,"method":"elicitation/create","params":params})
for line in sys.stdin:
    f=json.loads(line)
    method=f.get("method")
    result={}
    if method=="initialize":
        result={"protocolVersion":f["params"]["protocolVersion"],"capabilities":{"tools":{}},"serverInfo":{"name":"m01_fixture","version":"1"}}
    elif method=="tools/list":
        result={"tools":[{"name":"elicit","description":"Synthetic form/URL cancellation fixture; no effects","inputSchema":{"type":"object","properties":{}}}]}
    elif method=="tools/call":
        pending=f["id"]
        request("form")
        continue
    elif method is None and f.get("id")=="form":
        request("url")
        continue
    elif method is None and f.get("id")=="url":
        send({"jsonrpc":"2.0","id":pending,"result":{"content":[{"type":"text","text":"Fixture cancelled; no effects"}]}})
        continue
    if "id" in f and method:
        send({"jsonrpc":"2.0","id":f["id"],"result":result})
"""


def run():
    native.preflight()
    root = pathlib.Path(
        tempfile.mkdtemp(prefix="appraise-m01-mcp-", dir="/private/tmp")
    )
    for name in ["home", "codex", "workspace", "tmp"]:
        (root / name).mkdir(mode=0o700)
    stub = root / "stub.py"
    stub.write_text(STUB)
    report = {
        "evidenceClass": "actual-binary-no-model-mcp-elicitation",
        "binarySha256": native.BINARY_SHA,
        "sourceSha256": native.digest(pathlib.Path(__file__).read_bytes()),
        "sharedClientSourceSha256": native.digest(source.read_bytes()),
        "requests": [],
        "events": [],
        "elicitationReplies": [],
        "processExits": [],
        "externalInferenceTurns": 0,
        "authFilePresent": False,
        "m01Complete": False,
    }

    class Handler(BaseHTTPRequestHandler):
        call_sent = False

        def log_message(self, *_args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            tools = [t.get("name") for t in body.get("tools", [])]
            report["requests"].append(
                {
                    "toolNames": tools,
                    "authorizationPresent": bool(self.headers.get("Authorization")),
                }
            )
            if self.headers.get("Authorization"):
                raise RuntimeError("unexpected auth at fixture")
            if not Handler.call_sent:
                names = [name for name in tools if name and name.endswith("__elicit")]
                if len(names) != 1:
                    report["parkedReason"] = "fixture MCP tool absent or ambiguous"
                    self.send_error(400)
                    return
                Handler.call_sent = True
                item = {
                    "type": "function_call",
                    "id": "m01-call",
                    "call_id": "m01-call",
                    "name": names[0],
                    "arguments": "{}",
                    "status": "completed",
                }
            else:
                item = {
                    "type": "message",
                    "id": "m01-message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "M01-NO-MODEL-OK",
                            "annotations": [],
                        }
                    ],
                }
            events = [
                {
                    "type": "response.created",
                    "response": {"id": "m01-response", "status": "in_progress"},
                },
                {"type": "response.output_item.done", "output_index": 0, "item": item},
                {
                    "type": "response.completed",
                    "response": {
                        "id": "m01-response",
                        "status": "completed",
                        "output": [item],
                        "usage": {
                            "input_tokens": 1,
                            "output_tokens": 1,
                            "total_tokens": 2,
                        },
                    },
                },
            ]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for event in events:
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

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    config = (
        native.CONFIG.replace('model_provider="openai"', 'model_provider="m01_fixture"')
        + f"""
[model_providers.m01_fixture]
name="M01 scripted local fixture"
base_url="http://127.0.0.1:{server.server_port}/v1"
wire_api="responses"
requires_openai_auth=false
supports_websockets=false
request_max_retries=0
stream_max_retries=0
[mcp_servers.m01_fixture]
command={json.dumps(sys.executable)}
args=[{json.dumps(str(stub))}]
required=true
"""
    )
    (root / "codex/config.toml").write_text(config)
    report["configSha256"] = native.digest(config.encode())
    report["normalizedConfigSha256"] = native.digest(
        config.replace(str(root), "<state>")
        .replace(str(server.server_port), "<port>")
        .encode()
    )

    class Connection(native.Connection):
        def frame(self, frame):
            if "id" in frame and "method" in frame:
                if frame["method"] != "mcpServer/elicitation/request":
                    raise RuntimeError("unexpected non-elicitation request; park")
                mode = frame["params"].get("mode")
                self.evidence["elicitationReplies"].append(
                    {
                        "method": frame["method"],
                        "id": frame["id"],
                        "mode": mode,
                        "action": "cancel",
                        "content": None,
                    }
                )
                self.process.stdin.write(
                    (
                        json.dumps(
                            {
                                "id": frame["id"],
                                "result": {"action": "cancel", "content": None},
                            }
                        )
                        + "\n"
                    ).encode()
                )
                self.process.stdin.flush()
                return
            method = frame.get("method")
            if method in ("item/started", "item/completed"):
                item = frame["params"]["item"]
                if item["type"] == "mcpToolCall":
                    if (
                        item.get("server") != "m01_fixture"
                        or item.get("tool") != "elicit"
                    ):
                        raise RuntimeError("foreign MCP tool activity; park")
                    self.evidence.setdefault("mcpItems", []).append(
                        {
                            "method": method,
                            "type": item["type"],
                            "status": item.get("status"),
                        }
                    )
                    self.frames.append(frame)
                    return
            super().frame(frame)

    connection = Connection(root, report)
    try:
        init = connection.rpc(
            "initialize",
            {
                "clientInfo": {"name": "appraise_m01_mcp", "version": "0.1"},
                "capabilities": {"experimentalApi": False},
            },
        )
        assert init["codexHome"] == str(root / "codex")
        report["userAgent"] = init["userAgent"]
        connection.process.stdin.write(b'{"method":"initialized"}\n')
        connection.process.stdin.flush()
        effective = connection.rpc(
            "config/read", {"includeLayers": True, "cwd": str(root / "workspace")}
        )
        assert effective["config"]["model_provider"] == "m01_fixture"
        for layer in effective["layers"]:
            own = layer["name"]["type"] == "user" and layer["name"]["file"] == str(
                root / "codex/config.toml"
            )
            empty = layer["name"]["type"] == "system" and not layer["config"]
            assert own or empty
        report["effectiveConfigSha256"] = native.digest(
            json.dumps(effective["config"], sort_keys=True)
            .replace(str(root), "<state>")
            .replace(str(server.server_port), "<port>")
            .encode()
        )
        start = connection.rpc(
            "thread/start", {**native.shared(root), "modelProvider": "m01_fixture"}
        )
        connection.thread_id = start["thread"]["id"]
        turn = connection.rpc(
            "turn/start",
            {
                "threadId": connection.thread_id,
                "input": [
                    {
                        "type": "text",
                        "text": "Synthetic local fixture only.",
                        "text_elements": [],
                    }
                ],
                "model": "gpt-6.1-sol",
            },
        )
        report["scriptedTurnStarts"] = 1
        report["terminalStatus"] = native.terminal(connection, turn["turn"]["id"])
    except (RuntimeError, TimeoutError, AssertionError, KeyError, OSError) as error:
        report["parkedReason"] = type(error).__name__ + ": " + str(error)
    finally:
        connection.close()
        server.shutdown()
        server.server_close()
        report["authFilePresent"] = (root / "codex/auth.json").exists()
        native.save(root / "observation.json", report)
        print(
            json.dumps(
                {
                    "stateRoot": str(root),
                    "observation": str(root / "observation.json"),
                    "elicitationModes": [
                        r["mode"] for r in report["elicitationReplies"]
                    ],
                    "parkedReason": report.get("parkedReason"),
                }
            )
        )


if __name__ == "__main__":
    run()
