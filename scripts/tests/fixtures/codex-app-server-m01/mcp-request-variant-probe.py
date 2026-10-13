"""No-model RPC-only MCP cancellation observations; no permission grants or native exec."""

import argparse
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
path = pathlib.Path(__file__).with_name("native-provider-probe.py")
spec = importlib.util.spec_from_file_location("native", path)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
MODES = ["form", "url", "openai/form", "openaiForm"]
FIXTURE_POLICY = {
    "granular": {
        "mcp_elicitations": True,
        "sandbox_approval": False,
        "rules": False,
        "request_permissions": False,
        "skill_approval": False,
    }
}
STUB = r"""
import json,sys
pending=None
case=None
issued_method=None
def send(frame):
    print(json.dumps(frame),flush=True)
for line in sys.stdin:
    f=json.loads(line)
    method=f.get("method")
    result={}
    if method=="initialize":
        result={"protocolVersion":f["params"]["protocolVersion"],"capabilities":{"tools":{}},"serverInfo":{"name":"m01_variants","version":"1"}}
    elif method=="tools/list":
        result={"tools":[{"name":"elicit","description":"Synthetic cancellation only; no effects","inputSchema":{"type":"object","properties":{"mode":{"type":"string"}},"required":["mode"]}}]}
    elif method=="tools/call":
        pending=f["id"]
        case=f["params"]["arguments"]["mode"]
        params={"mode":case,"message":"Synthetic no-effect elicitation"}
        issued_method="elicitation/create"
        if case=="url":
            params.update(url="https://example.invalid/m01-fixture",elicitationId="m01-url")
        else:
            params["requestedSchema"]={"type":"object","properties":{"fixture":{"type":"string"}}}
        if case=="openai/form":
            issued_method="openai/elicitation/create"
            params["mode"]="form"
        elif case=="openaiForm":
            issued_method="openai/form"
            del params["mode"]
        send({"jsonrpc":"2.0","id":"elicitation-"+case,"method":issued_method,"params":params})
        continue
    elif method is None and f.get("id")=="elicitation-"+str(case):
        observed={"mode":case,"protocolMethod":issued_method,"action":f.get("result",{}).get("action"),"responseWasError":"error" in f,"errorCode":f.get("error",{}).get("code"),"errorMessage":f.get("error",{}).get("message")}
        send({"jsonrpc":"2.0","id":pending,"result":{"content":[{"type":"text","text":"Synthetic fixture response"}],"structuredContent":observed}})
        continue
    if method and "id" in f:
        send({"jsonrpc":"2.0","id":f["id"],"result":result})
"""


def run(cancellation_exception=False):
    native.preflight()
    root = pathlib.Path(
        tempfile.mkdtemp(prefix="appraise-m01-variants-", dir="/private/tmp")
    )
    for name in ["home", "codex", "workspace", "tmp"]:
        (root / name).mkdir(mode=0o700)
    stub = root / "stub.py"
    stub.write_text(STUB)
    config = (
        native.CONFIG.replace('model_provider="openai"', 'model_provider="m01_offline"')
        + f"""
[model_providers.m01_offline]
name="M01 non-serving offline provider"
base_url="http://127.0.0.1:1/v1"
wire_api="responses"
requires_openai_auth=false
supports_websockets=false
request_max_retries=0
stream_max_retries=0
[mcp_servers.m01_variants]
command={json.dumps(sys.executable)}
args=[{json.dumps(str(stub))}]
required=true
"""
    )
    if cancellation_exception:
        config = config.replace(
            'approval_policy="never"',
            "approval_policy={granular={mcp_elicitations=true,sandbox_approval=false,rules=false,request_permissions=false,skill_approval=false}}",
        )
    (root / "codex/config.toml").write_text(config)
    report = {
        "evidenceClass": "actual-binary-rpc-only-no-model-request-variants",
        "binarySha256": native.BINARY_SHA,
        "sourceSha256": native.digest(pathlib.Path(__file__).read_bytes()),
        "sharedClientSourceSha256": native.digest(path.read_bytes()),
        "configSha256": native.digest(config.encode()),
        "cases": [],
        "requests": [],
        "events": [],
        "processExits": [],
        "turnStarts": 0,
        "externalInferenceTurns": 0,
        "permissionGrants": 0,
        "nativeExecCalls": 0,
        "m01Complete": False,
        "fixturePolicyException": cancellation_exception,
        "approvalPolicy": FIXTURE_POLICY if cancellation_exception else "never",
        "fixtureExceptionDocumentSha256": native.digest(
            (native.TASK / "m01-fixture-policy-exception.md").read_bytes()
        )
        if cancellation_exception
        else None,
    }
    schemas = root / "schemas"
    subprocess.run(
        [native.BINARY, "app-server", "generate-json-schema", "--out", str(schemas)],
        env=native.environment(root),
        cwd=root / "workspace",
        capture_output=True,
        check=True,
    )
    files = [
        {"file": str(p.relative_to(schemas)), "sha256": native.digest(p.read_bytes())}
        for p in sorted(schemas.rglob("*.json"))
    ]
    pin = json.loads((native.TASK / "m01/schema-pin.json").read_text())
    assert (
        native.digest(json.dumps(files, separators=(",", ":")).encode())
        == pin["manifestSha256"]
    )
    report["schemaManifestSha256"] = pin["manifestSha256"]

    class Connection(native.Connection):
        def frame(self, frame):
            if "id" in frame and "method" in frame:
                if frame["method"] != "mcpServer/elicitation/request":
                    raise RuntimeError("unexpected request; park without grant")
                mode = frame["params"].get("mode")
                if mode not in MODES:
                    raise RuntimeError("unplanned elicitation mode; park")
                if (
                    frame["params"].get("threadId") != self.thread_id
                    or frame["params"].get("serverName") != "m01_variants"
                ):
                    raise RuntimeError("foreign elicitation binding; park")
                report["requests"].append(
                    {
                        "id": frame["id"],
                        "method": frame["method"],
                        "mode": mode,
                        "action": "cancel",
                        "content": None,
                        "threadId": frame["params"].get("threadId"),
                        "turnId": frame["params"].get("turnId"),
                        "serverName": frame["params"].get("serverName"),
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
            super().frame(frame)

        def send(self, method, params=None):
            if method in ["turn/start", "turn/resume"]:
                raise RuntimeError("RPC-only fixture refuses model turns")
            return super().send(method, params)

    connection = Connection(root, report)
    try:
        init = connection.rpc(
            "initialize",
            {
                "clientInfo": {"name": "appraise_m01_variants", "version": "0.1"},
                "capabilities": {
                    "experimentalApi": cancellation_exception,
                    **(
                        {"extensions": {"openai/form": {}}}
                        if cancellation_exception
                        else {}
                    ),
                },
            },
        )
        assert init["codexHome"] == str(root / "codex")
        report["userAgent"] = init["userAgent"]
        connection.process.stdin.write(b'{"method":"initialized"}\n')
        connection.process.stdin.flush()
        effective = connection.rpc(
            "config/read", {"includeLayers": True, "cwd": str(root / "workspace")}
        )
        assert effective["config"]["model_provider"] == "m01_offline"
        for layer in effective["layers"]:
            own = layer["name"]["type"] == "user" and layer["name"]["file"] == str(
                root / "codex/config.toml"
            )
            empty = layer["name"]["type"] == "system" and not layer["config"]
            assert own or empty
        report["effectiveConfigSha256"] = native.digest(
            json.dumps(effective["config"], sort_keys=True)
            .replace(str(root), "<state>")
            .encode()
        )
        start = connection.rpc(
            "thread/start",
            {
                **native.shared(root),
                "modelProvider": "m01_offline",
                "approvalPolicy": FIXTURE_POLICY if cancellation_exception else "never",
            },
        )
        connection.thread_id = start["thread"]["id"]
        report["threadId"] = connection.thread_id
        for mode in MODES:
            before = len(report["requests"])
            response = connection.rpc(
                "mcpServer/tool/call",
                {
                    "threadId": connection.thread_id,
                    "server": "m01_variants",
                    "tool": "elicit",
                    "arguments": {"mode": mode},
                },
            )
            observed = response.get("structuredContent", {})
            report["cases"].append(
                {
                    "requestedMode": mode,
                    "nativeRequestCount": len(report["requests"]) - before,
                    "stubObserved": observed,
                    "isError": response.get("isError"),
                }
            )
            if observed.get("mode") != mode:
                raise RuntimeError("stub result correlation mismatch; park")
    except (RuntimeError, TimeoutError, AssertionError, KeyError, OSError) as error:
        report["parkedReason"] = type(error).__name__ + ": " + str(error)
    finally:
        connection.close()
        report["authFilePresent"] = (root / "codex/auth.json").exists()
        report["intents"] = [
            json.loads(line)
            for line in (root / "intents.jsonl").read_text().splitlines()
        ]
        assert not any(i["method"] == "turn/start" for i in report["intents"])
        native.save(root / "observation.json", report)
        print(
            json.dumps(
                {
                    "stateRoot": str(root),
                    "observation": str(root / "observation.json"),
                    "requestModes": [r["mode"] for r in report["requests"]],
                    "parkedReason": report.get("parkedReason"),
                }
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cancellation-exception", action="store_true")
    args = parser.parse_args()
    run(args.cancellation_exception)
