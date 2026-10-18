"""Offline pinned-binary/config metadata inspection. No CLI launch, auth or transport."""

import argparse
import hashlib
import json
import pathlib

import tomllib

BINARY = pathlib.Path(
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
)
BINARY_SHA = "0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28"


def extract_model(binary, slug):
    marker = f'"slug": "{slug}"'.encode()
    if binary.count(marker) != 1:
        raise ValueError("selected model metadata missing or ambiguous")
    offset = binary.index(marker)
    start = binary.rfind(b"{", 0, offset)
    model, _ = json.JSONDecoder().raw_decode(
        binary[start : start + 250000].decode("utf-8", errors="ignore")
    )
    if model.get("slug") != slug:
        raise ValueError("selected model object mismatch")
    return model, start


def inspect(root):
    if (
        root.parent != pathlib.Path("/private/tmp")
        or not root.name.startswith("appraise-m01-mcp-")
        or root.is_symlink()
    ):
        raise ValueError("explicit owned unsigned fixture root required")
    codex = root / "codex"
    config_file = codex / "config.toml"
    if codex.is_symlink() or config_file.is_symlink() or (codex / "auth.json").exists():
        raise ValueError("fixture state must be owned and unsigned")
    data = config_file.read_bytes()
    config = tomllib.loads(data.decode())
    binary = BINARY.read_bytes()
    if hashlib.sha256(binary).hexdigest() != BINARY_SHA:
        raise ValueError("executable pin changed")
    model, offset = extract_model(binary, config["model"])
    code_mode = config.get("features", {}).get("code_mode")
    return {
        "evidenceClass": "offline-exact-binary-model-and-fixture-config-inspection",
        "binarySha256": BINARY_SHA,
        "diagnosticSourceSha256": hashlib.sha256(
            pathlib.Path(__file__).read_bytes()
        ).hexdigest(),
        "stateId": root.name,
        "configSha256": hashlib.sha256(data).hexdigest(),
        "model": {
            key: model.get(key) for key in ["slug", "tool_mode", "use_responses_lite"]
        },
        "embeddedModelJsonOffset": offset,
        "embeddedModelCanonicalSha256": hashlib.sha256(
            json.dumps(model, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "configuredCodeMode": code_mode,
        "ownedModelCachePresent": (codex / "models_cache.json").exists(),
        "appServerLaunches": 0,
        "threadStarts": 0,
        "turnStarts": 0,
        "providerRequests": 0,
        "credentialsRead": False,
        "m01Complete": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=pathlib.Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.root), indent=2))
