"""M02-B0 offline planning and guards. No executable, network or runtime adapter."""

import argparse
import copy
import hashlib
import json
import pathlib
import re

POLICY_FILE = pathlib.Path(__file__).with_name("policy.json")
ROOT = "/private/tmp/appraise-m02-b-20261015-p1"
POLICY_DIGEST = "77edf6ba0d2c9593a39118b62b5dfd12e311c05eb856e6de6d5868e80211095b"
BASELINE_FEATURES = (
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
)
DENIAL_CLASSES = {
    "unregistered",
    "invocation-rejected",
    "os-effect-denied",
    "effect-occurred",
    "unreached",
    "UNKNOWN",
}


class Blocked(RuntimeError):
    pass


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def load_policy():
    policy = json.loads(POLICY_FILE.read_text())
    validate_policy(policy)
    return policy


def validate_policy(policy):
    if digest(encoded(policy)) != POLICY_DIGEST:
        raise Blocked("policy bytes changed; review required")
    if policy["schema"] != "appraise.m02-b0-policy/v1" or policy["root"] != ROOT:
        raise Blocked("policy identity changed")
    if policy["runtimeExecutionAllowed"] is not False:
        raise Blocked("B0 cannot authorize runtime")
    expected = {
        "turnStarts": 14,
        "threadStarts": 15,
        "providerRequests": 55,
        "activeCases": 1,
        "ackSeconds": 60,
        "caseSeconds": 60,
        "overallSeconds": 1800,
        "externalInference": 0,
        "authOperations": 0,
        "permissionGrants": 0,
        "permittedNativeEffects": 0,
        "retries": 0,
    }
    if policy["ceilings"] != expected:
        raise Blocked("budget policy changed")
    cases = policy["cases"]
    if [c["id"] for c in cases] != [f"B{i:02}" for i in range(1, 15)] + ["P00"]:
        raise Blocked("case inventory changed")
    for key, ceiling in [
        ("maxTurnStarts", 14),
        ("maxThreadStarts", 15),
        ("maxProviderRequests", 55),
    ]:
        if sum(c[key] for c in cases) != ceiling:
            raise Blocked("case and aggregate budgets disagree")
    if any(c["wireRoute"] != "UNQUALIFIED" for c in cases):
        raise Blocked("offline policy cannot attest routing")


def planning_manifest(policy, *, existing_root=False, symlink_components=()):
    validate_policy(policy)
    if existing_root or symlink_components:
        raise Blocked("fixed root exists or has symlink components")
    return {
        "evidenceClass": "offline-preparation-only",
        "policySha256": digest(encoded(policy)),
        "runtimeExecutionAllowed": False,
        "root": ROOT,
        "paths": [f"{ROOT}/{name}" for name in ("supervisor", "evidence")]
        + [
            f"{ROOT}/cases/{c['id']}/{part}"
            for c in policy["cases"]
            for part in ("home", "codex", "workspace", "tmp", "canaries")
        ],
        "ceilings": copy.deepcopy(policy["ceilings"]),
        "blockers": copy.deepcopy(policy["unqualified"]),
        "launches": 0,
        "sockets": 0,
        "authOperations": 0,
        "externalInference": 0,
        "permissionGrants": 0,
    }


def case_configuration(policy, case_id):
    """Symbolic configuration only. The port placeholder is deliberately not launchable."""
    validate_policy(policy)
    case = next((c for c in policy["cases"] if c["id"] == case_id), None)
    if case is None:
        raise Blocked("unplanned case")
    root = f"{ROOT}/cases/{case_id}"
    env = {
        "HOME": f"{root}/home",
        "CODEX_HOME": f"{root}/codex",
        "TMPDIR": f"{root}/tmp",
        "PATH": "/usr/bin:/bin",
        "LANG": "C",
        "RUST_LOG": "off",
    }
    asking = case["profile"] == "asking-only"
    policy_text = (
        (
            "{granular={mcp_elicitations=false,sandbox_approval=false,rules=false,"
            "request_permissions=true,skill_approval=false}}"
        )
        if asking
        else '"never"'
    )
    config = (
        "\n".join(
            [
                'model="gpt-6.1-sol"',
                'model_reasoning_effort="medium"',
                'model_provider="m02_scripted"',
                f"approval_policy={policy_text}",
                'sandbox_mode="read-only"',
                'web_search="disabled"',
                'cli_auth_credentials_store="file"',
                'mcp_oauth_credentials_store="file"',
                "[shell_environment_policy]",
                'inherit="none"',
                "[features]",
                *(f"{name}=false" for name in BASELINE_FEATURES),
                f"request_permissions_tool={'true' if asking else 'false'}",
                "[analytics]",
                "enabled=false",
                "[model_providers.m02_scripted]",
                'name="M02 local scripted fixture"',
                'wire_api="responses"',
                'base_url="http://127.0.0.1:<assigned-port>/v1"',
                "requires_openai_auth=false",
                "supports_websockets=false",
                "request_max_retries=0",
                "stream_max_retries=0",
            ]
        )
        + "\n"
    )
    return {
        "caseId": case_id,
        "environment": env,
        "cwd": f"{root}/workspace",
        "argvTemplate": [policy["pins"]["binary"], "app-server"],
        "configTemplate": config,
        "requiredMcp": True,
        "experimentalApi": asking,
        "askingExceptionAuthorized": False,
        "mcpTransportAdapter": "NOT_IMPLEMENTED",
        "runtimeExecutionAllowed": False,
    }


class BudgetJournal:
    """Pure simulation with an injected durability sink, not a provider send boundary.

    The sink must acknowledge the bytes before reserve returns. A future file/fsync and
    owned transport adapter requires its own implementation/review/authorization.
    """

    def __init__(self, policy, sink, clock, snapshot=None):
        validate_policy(policy)
        self.policy = copy.deepcopy(policy)
        self.sink = sink
        self.clock = clock
        self.fenced = False
        self.state = {
            "policySha256": digest(encoded(policy)),
            "startedAt": clock(),
            "active": None,
            "blocked": False,
            "cases": {},
            "counts": {"turnStarts": 0, "threadStarts": 0, "providerRequests": 0},
            "pending": None,
            "events": [],
        }
        if snapshot is not None:
            payload = json.loads(snapshot)
            if digest(encoded(payload["state"])) != payload["stateSha256"]:
                raise Blocked("journal integrity mismatch")
            self.state = payload["state"]
            if self.state["policySha256"] != digest(encoded(policy)):
                raise Blocked("journal policy changed")
            for key, count in self.state["counts"].items():
                if (
                    not isinstance(count, int)
                    or count < 0
                    or count > policy["ceilings"][key]
                ):
                    raise Blocked("invalid retained budget")
            # No continuation/restart path is qualified in B0.
            self.state["blocked"] = True

    def persist(self):
        data = encoded(
            {"state": self.state, "stateSha256": digest(encoded(self.state))}
        )
        try:
            if self.sink(data) != digest(data):
                raise Blocked("durability sink did not acknowledge exact bytes")
        except Exception as error:
            self.fenced = True
            self.state["blocked"] = True
            raise Blocked("journal write uncertain; retain consumed budget") from error
        return data

    def check(self):
        if self.fenced or self.state["blocked"]:
            raise Blocked("fenced; reconcile, never resend")
        if (
            self.clock() - self.state["startedAt"]
            >= self.policy["ceilings"]["overallSeconds"]
        ):
            self.state["blocked"] = True
            self.persist()
            raise Blocked("overall deadline")
        active = self.state["active"]
        if active and self.clock() - self.state["cases"][active]["startedAt"] >= 60:
            self.unknown("case-deadline")

    def begin(self, case_id):
        self.check()
        if self.state["active"] is not None or case_id in self.state["cases"]:
            raise Blocked("case overlap or redispatch")
        case = next((c for c in self.policy["cases"] if c["id"] == case_id), None)
        if case is None:
            raise Blocked("unplanned case")
        self.state["active"] = case_id
        self.state["cases"][case_id] = {
            "startedAt": self.clock(),
            "threadStarts": 0,
            "turnStarts": 0,
            "providerRequests": 0,
            "toolCalls": 0,
            "phase": "ready",
        }
        self.persist()

    def reserve(self, kind, request_id):
        self.check()
        case_id = self.state["active"]
        if case_id is None or self.state["pending"] is not None:
            raise Blocked("no active case or unresolved request")
        case = next(c for c in self.policy["cases"] if c["id"] == case_id)
        state = self.state["cases"][case_id]
        limits = {
            "threadStarts": "maxThreadStarts",
            "turnStarts": "maxTurnStarts",
            "providerRequests": "maxProviderRequests",
            "toolCalls": "maxToolCalls",
        }
        if kind not in limits or not re.fullmatch(
            r"[A-Za-z0-9._:-]{1,200}", request_id
        ):
            raise Blocked("unknown request kind or ID")
        if any(e["requestId"] == request_id for e in self.state["events"]):
            raise Blocked("duplicate request identity")
        if state[kind] >= case[limits[kind]]:
            raise Blocked("case budget exhausted")
        if (
            kind in self.state["counts"]
            and self.state["counts"][kind] >= self.policy["ceilings"][kind]
        ):
            raise Blocked("aggregate budget exhausted")
        if kind == "threadStarts" and state["phase"] != "ready":
            raise Blocked("thread already attempted")
        if kind == "turnStarts" and state["phase"] != "thread-acknowledged":
            raise Blocked("thread must be acknowledged first")
        if (
            kind in ("providerRequests", "toolCalls")
            and state["phase"] != "turn-acknowledged"
        ):
            raise Blocked("turn must be acknowledged first")
        state[kind] += 1
        if kind in self.state["counts"]:
            self.state["counts"][kind] += 1
        self.state["events"].append(
            {
                "caseId": case_id,
                "kind": kind,
                "requestId": request_id,
                "reservedAt": self.clock(),
            }
        )
        self.state["pending"] = {
            "kind": kind,
            "requestId": request_id,
            "at": self.clock(),
        }
        self.persist()
        return {"simulationOnly": True, "requestId": request_id}

    def acknowledge(self, request_id, *, rejected=False):
        self.check()
        pending = self.state["pending"]
        if pending is None or pending["requestId"] != request_id:
            self.unknown("foreign-or-late-ack")
        if self.clock() - pending["at"] >= 60:
            self.unknown("ack-deadline")
        state = self.state["cases"][self.state["active"]]
        if rejected:
            if self.state["active"] != "P00" or pending["kind"] != "threadStarts":
                self.unknown("unplanned-rejection")
            state["phase"] = "required-mcp-rejected"
        elif pending["kind"] in ("threadStarts", "turnStarts"):
            state["phase"] = (
                "thread-acknowledged"
                if pending["kind"] == "threadStarts"
                else "turn-acknowledged"
            )
        self.state["pending"] = None
        self.persist()

    def finish(self, outcome):
        self.check()
        active = self.state["active"]
        if not active or self.state["pending"]:
            raise Blocked("cannot finish unresolved case")
        state = self.state["cases"][active]
        if (
            active == "P00"
            and (
                outcome != "thread-start-rejected"
                or state["phase"] != "required-mcp-rejected"
            )
        ) or (
            active != "P00"
            and (
                outcome not in DENIAL_CLASSES | {"synthetic-accepted"}
                or state["phase"] != "turn-acknowledged"
            )
        ):
            raise Blocked("invalid terminal observation")
        case = next(c for c in self.policy["cases"] if c["id"] == active)
        if outcome == "synthetic-accepted" and case["kind"] != "scoped-role":
            raise Blocked("negative case cannot be accepted")
        if outcome in ("UNKNOWN", "effect-occurred"):
            self.unknown(outcome)
        state["outcome"] = outcome
        self.state["active"] = None
        self.persist()

    def unknown(self, reason):
        self.state["blocked"] = True
        allowed = {
            "case-deadline",
            "foreign-or-late-ack",
            "ack-deadline",
            "unplanned-rejection",
            "withheld-ack",
            "UNKNOWN",
            "effect-occurred",
            "transport-loss",
            "cleanup-unknown",
        }
        self.state["blockerCode"] = reason if reason in allowed else "unexpected"
        self.persist()
        raise Blocked("UNKNOWN; retain intent, never resend")


def inspect_manifest(body):
    locations, tools = [], []
    if not isinstance(body, dict):
        raise Blocked("malformed provider body")
    if "tools" in body:
        if not isinstance(body["tools"], list):
            raise Blocked("malformed top-level tools")
        locations.append("tools")
        tools.extend(body["tools"])
    items = body.get("input", [])
    if not isinstance(items, list):
        raise Blocked("malformed provider input")
    for index, item in enumerate(items):
        if isinstance(item, dict) and item.get("type") == "additional_tools":
            if item.get("role") != "developer" or not isinstance(
                item.get("tools"), list
            ):
                raise Blocked("malformed additional_tools")
            locations.append(f"input[{index}].additional_tools")
            tools.extend(item["tools"])
    names = []

    def visit(tool, prefix="", depth=0):
        if depth > 8 or len(names) >= 128:
            raise Blocked("tool manifest bounds")
        if not isinstance(tool, dict) or tool.get("type") not in (
            "function",
            "custom",
            "namespace",
        ):
            raise Blocked("unsupported tool descriptor")
        name = tool.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(
            r"[A-Za-z0-9_.:-]{1,200}", name
        ):
            raise Blocked("invalid tool name")
        if tool["type"] == "namespace":
            if not isinstance(tool.get("tools"), list):
                raise Blocked("malformed namespace")
            for nested in tool["tools"]:
                visit(nested, prefix + name + ".", depth + 1)
        else:
            if len(prefix + name) > 200:
                raise Blocked("qualified tool name bounds")
            names.append(
                {
                    "name": prefix + name,
                    "type": tool["type"],
                    "schemaHash": digest(encoded(tool)),
                }
            )

    for tool in tools:
        visit(tool)
    if not locations or len({t["name"] for t in names}) != len(names):
        raise Blocked("uninspected or duplicate callable manifest")
    return {
        "locations": locations,
        "tools": names,
        "manifestHash": digest(encoded(tools)),
    }


def manifest_gate(body, expected, *, route="UNQUALIFIED"):
    report = inspect_manifest(body)
    if (
        not isinstance(expected, dict)
        or not isinstance(expected.get("tools"), list)
        or not isinstance(expected.get("manifestHash"), str)
    ):
        raise Blocked("immutable manifest fingerprints required")
    if report["manifestHash"] != expected["manifestHash"] or sorted(
        report["tools"], key=lambda t: t["name"]
    ) != sorted(expected["tools"], key=lambda t: t["name"]):
        raise Blocked("unexpected, missing or changed callable/namespace descriptors")
    if route != "OFFLINE_SYNTHETIC":
        raise Blocked("native/Code Mode routing unqualified")
    return {
        **report,
        "evidenceClass": "offline-synthetic-manifest-only",
        "containmentQualified": False,
    }


def denial_reply(case_id, frame, binding):
    if not isinstance(frame, dict) or not isinstance(frame.get("method"), str):
        raise Blocked("malformed server request")
    request_id = frame.get("id")
    if (
        isinstance(request_id, bool)
        or not isinstance(request_id, (str, int))
        or (
            isinstance(request_id, str)
            and not re.fullmatch(r"[A-Za-z0-9._:-]{1,200}", request_id)
        )
    ):
        raise Blocked("invalid server request ID")
    if not isinstance(frame.get("params", {}), dict):
        raise Blocked("malformed request parameters")
    if frame["method"] == "item/permissions/requestApproval":
        if (
            case_id != "B14"
            or any(
                frame.get("params", {}).get(k) != binding.get(k)
                for k in ("threadId", "turnId", "itemId")
            )
            or not all(binding.get(k) for k in ("threadId", "turnId", "itemId"))
        ):
            raise Blocked("foreign permission request; no grant")
        return {"id": frame["id"], "result": {"permissions": {}, "scope": "turn"}}
    return {
        "id": frame["id"],
        "error": {"code": -32601, "message": "unsupported fixture request"},
    }


class DenialGuard:
    def __init__(self, case_id, binding):
        self.case_id = case_id
        self.binding = copy.deepcopy(binding)
        self.fenced = False

    def receive(self, frame):
        if self.fenced:
            raise Blocked("duplicate or continued request after denial")
        self.fenced = True
        return denial_reply(self.case_id, frame, self.binding)


def evidence_projection(case_id, classification, counters, manifest_hash):
    if case_id not in [f"B{i:02}" for i in range(1, 15)] + [
        "P00"
    ] or classification not in DENIAL_CLASSES | {
        "synthetic-accepted",
        "thread-start-rejected",
    }:
        raise Blocked("unrecognized observation")
    if not re.fullmatch(r"[a-f0-9]{64}", manifest_hash):
        raise Blocked("invalid manifest digest")
    safe = {
        key: counters[key] for key in ("turnStarts", "threadStarts", "providerRequests")
    }
    if any(
        not isinstance(v, int) or isinstance(v, bool) or v < 0 for v in safe.values()
    ):
        raise Blocked("invalid evidence counter")
    ceilings = {"turnStarts": 14, "threadStarts": 15, "providerRequests": 55}
    if any(v > ceilings[k] for k, v in safe.items()):
        raise Blocked("evidence counter exceeds ceiling")
    return {
        "caseId": case_id,
        "classification": classification,
        "counts": safe,
        "manifestSha256": manifest_hash,
        "evidenceClass": "offline-synthetic",
        "containmentQualified": False,
        "M02Complete": False,
    }


def execute(*_args, **_kwargs):
    raise Blocked(
        "B0 has no runtime adapter; separate exact-artifact execution authority required"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--describe", action="store_true", required=True)
    parser.parse_args()
    print(json.dumps(planning_manifest(load_policy()), indent=2))


if __name__ == "__main__":
    main()
