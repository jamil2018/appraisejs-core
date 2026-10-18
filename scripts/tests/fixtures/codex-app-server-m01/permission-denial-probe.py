"""One local scripted permission request; empty grant only, no inference/commands/exec."""

import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True
path = pathlib.Path(__file__).with_name("native-provider-probe.py")
spec = importlib.util.spec_from_file_location("native", path)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
manifest_path = path.with_name("mcp-elicitation-probe.py")
spec = importlib.util.spec_from_file_location("manifest", manifest_path)
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)
POLICY = {
    "granular": {
        "mcp_elicitations": False,
        "sandbox_approval": False,
        "rules": False,
        "request_permissions": True,
        "skill_approval": False,
    }
}


def empty_grant(frame, thread_id):
    if frame.get("method") != "item/permissions/requestApproval":
        raise RuntimeError("unplanned request; no grant")
    params = frame["params"]
    if (
        params.get("threadId") != thread_id
        or not params.get("turnId")
        or not params.get("itemId")
    ):
        raise RuntimeError("permission correlation mismatch; no grant")
    return {"id": frame["id"], "result": {"permissions": {}, "scope": "turn"}}


def run():
    native.preflight()
    root = pathlib.Path(
        tempfile.mkdtemp(prefix="appraise-m01-denial-", dir="/private/tmp")
    )
    for name in ["home", "codex", "workspace", "tmp"]:
        (root / name).mkdir(mode=0o700)
    report = {
        "evidenceClass": "actual-binary-local-scripted-permission-denial",
        "binarySha256": native.BINARY_SHA,
        "sourceSha256": native.digest(pathlib.Path(__file__).read_bytes()),
        "sharedClientSourceSha256": native.digest(path.read_bytes()),
        "fixtureExceptionDocumentSha256": native.digest(
            (native.TASK / "m01-fixture-policy-exception.md").read_bytes()
        ),
        "events": [],
        "requests": [],
        "httpRequests": [],
        "processExits": [],
        "approvalPolicy": POLICY,
        "externalInferenceTurns": 0,
        "permissionGrants": 0,
        "nativeExecCalls": 0,
        "commandCalls": 0,
        "m01Complete": False,
    }

    class Handler(BaseHTTPRequestHandler):
        count = 0

        def log_message(self, *_args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            Handler.count += 1
            report["httpRequests"].append(
                {
                    **manifest.inspect_tool_manifest(body),
                    "authorizationPresent": bool(self.headers.get("Authorization")),
                }
            )
            if self.headers.get("Authorization") or Handler.count > 2:
                self.send_error(400)
                report["parkedReason"] = "unexpected auth/request count; no follow-up"
                return
            for item in body.get("input", []):
                if (
                    item.get("type") == "function_call_output"
                    and item.get("call_id") == "m01-permission"
                ):
                    output = item.get("output")
                    if isinstance(output, str):
                        try:
                            result = json.loads(output)
                        except ValueError:
                            report["toolOutputWasStructuredDenial"] = False
                        else:
                            report["toolResult"] = {
                                k: result.get(k) for k in ["permissions", "scope"]
                            }
                    else:
                        report["toolOutputWasStructuredDenial"] = False
            if Handler.count == 1:
                item = {
                    "type": "function_call",
                    "id": "m01-permission",
                    "call_id": "m01-permission",
                    "name": "request_permissions",
                    "arguments": json.dumps(
                        {
                            "permissions": {"network": {"enabled": True}},
                            "reason": "Synthetic denial fixture; no network operation",
                        }
                    ),
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
                            "text": "M01-DENIAL-OBSERVED",
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
        native.CONFIG.replace('model_provider="openai"', 'model_provider="m01_denial"')
        .replace(
            'approval_policy="never"',
            "approval_policy={granular={mcp_elicitations=false,sandbox_approval=false,rules=false,request_permissions=true,skill_approval=false}}",
        )
        .replace("[features]", "[features]\nrequest_permissions_tool=true")
        + f"""
[model_providers.m01_denial]
name="M01 local deterministic denial fixture"
base_url="http://127.0.0.1:{server.server_port}/v1"
wire_api="responses"
requires_openai_auth=false
supports_websockets=false
request_max_retries=0
stream_max_retries=0
"""
    )
    (root / "codex/config.toml").write_text(config)
    report["configSha256"] = native.digest(config.encode())

    class Connection(native.Connection):
        def frame(self, frame):
            if "id" in frame and "method" in frame:
                reply = empty_grant(frame, self.thread_id)
                if report["requests"]:
                    raise RuntimeError("duplicate permission request; park")
                params = frame["params"]
                report["requests"].append(
                    {
                        "id": frame["id"],
                        "method": frame["method"],
                        "threadId": params["threadId"],
                        "turnId": params["turnId"],
                        "itemId": params["itemId"],
                        "grantedPermissions": {},
                        "scope": "turn",
                    }
                )
                self.process.stdin.write((json.dumps(reply) + "\n").encode())
                self.process.stdin.flush()
                return
            super().frame(frame)

    connection = Connection(root, report)
    try:
        init = connection.rpc(
            "initialize",
            {
                "clientInfo": {"name": "appraise_m01_denial", "version": "0.1"},
                "capabilities": {"experimentalApi": True},
            },
        )
        assert init["codexHome"] == str(root / "codex")
        report["userAgent"] = init["userAgent"]
        connection.process.stdin.write(b'{"method":"initialized"}\n')
        connection.process.stdin.flush()
        effective = connection.rpc(
            "config/read", {"includeLayers": True, "cwd": str(root / "workspace")}
        )
        for layer in effective["layers"]:
            own = layer["name"]["type"] == "user" and layer["name"]["file"] == str(
                root / "codex/config.toml"
            )
            empty = layer["name"]["type"] == "system" and not layer["config"]
            assert own or empty
        assert effective["config"]["model_provider"] == "m01_denial"
        report["effectiveConfigSha256"] = native.digest(
            json.dumps(effective["config"], sort_keys=True)
            .replace(str(root), "<state>")
            .replace(str(server.server_port), "<port>")
            .encode()
        )
        start = connection.rpc(
            "thread/start",
            {
                **native.shared(root),
                "modelProvider": "m01_denial",
                "approvalPolicy": POLICY,
            },
        )
        connection.thread_id = start["thread"]["id"]
        report["threadId"] = connection.thread_id
        connection.turn_deadline = __import__("time").monotonic() + 60
        report["scriptedTurnStarts"] = 1
        turn = connection.rpc(
            "turn/start",
            {
                "threadId": connection.thread_id,
                "input": [
                    {
                        "type": "text",
                        "text": "Synthetic permission denial only; do not perform actions.",
                        "text_elements": [],
                    }
                ],
                "model": "gpt-6.1-sol",
            },
        )
        report["turnId"] = turn["turn"]["id"]
        report["terminalStatus"] = native.terminal(connection, report["turnId"])
    except (RuntimeError, TimeoutError, AssertionError, KeyError, OSError) as error:
        report["parkedReason"] = type(error).__name__ + ": " + str(error)
    finally:
        connection.close()
        server.shutdown()
        server.server_close()
        report["authFilePresent"] = (root / "codex/auth.json").exists()
        report["intents"] = [
            json.loads(line)
            for line in (root / "intents.jsonl").read_text().splitlines()
        ]
        native.save(root / "observation.json", report)
        print(
            json.dumps(
                {
                    "stateRoot": str(root),
                    "observation": str(root / "observation.json"),
                    "permissionRequests": len(report["requests"]),
                    "parkedReason": report.get("parkedReason"),
                }
            )
        )


if __name__ == "__main__":
    run()
