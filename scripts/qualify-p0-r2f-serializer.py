#!/usr/bin/env python3
"""Build a disposable schema-only causal canary; never build or install Codex."""

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=pathlib.Path, required=True)
parser.add_argument("--receipt", type=pathlib.Path, required=True)
parser.add_argument("--cargo", required=True)
parser.add_argument("--output", type=pathlib.Path, required=True)
args = parser.parse_args()
receipt = json.loads(args.receipt.read_text())
subject = {key: value for key, value in receipt.items()
           if key not in ("receiptSubjectSha256", "qualification")}
subject_hash = hashlib.sha256(json.dumps(subject, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
expected = {
    "role-REQUIREMENT_ANALYZER": ["quality_journey_analysis_get", "quality_journey_analysis_submit"],
    "role-SCOUT": ["quality_journey_discovery_get", "quality_journey_target_observation_submit"],
    "role-RESOURCE_EXPLORER": ["operation_search", "quality_journey_discovery_get", "quality_journey_resource_resolution_submit"],
    "role-TEST_SCENARIO_DESIGNER": ["quality_journey_scenarios_get", "quality_journey_scenarios_submit"],
    "role-AUTOMATOR": ["operation_search", "quality_journey_automation_materialize"],
    "role-TRIAGER": ["quality_journey_triage_get", "quality_journey_triage_evidence_read", "quality_journey_triage_submit"],
    **{f"probe-{suffix}": [f"p0_r2f_{suffix.replace('-', '_')}"] for suffix in (
        "inline-constraints", "defs-ref", "allof", "definitions-ref",
        "compaction-under-budget", "compaction-over-budget")},
}
rows = receipt.get("results", [])
if (receipt.get("schema") != "appraise.p0-r2f-schema-transport/v1"
        or subject_hash != receipt.get("receiptSubjectSha256")
        or len(rows) != len(expected)
        or len({row.get("arm") for row in rows}) != len(expected)):
    raise SystemExit("Invalid or incomplete schema receipt")
for row in rows:
    names = expected.get(row.get("arm"))
    if (names is None or [tool.get("name") for tool in row.get("expectedTools", [])] != names
            or [tool.get("name") for tool in row.get("capture", {}).get("observedTools", [])] != names
            or row.get("error") or row.get("capture", {}).get("requestCount") != 1
            or row.get("capture", {}).get("forwardedRequestCount") != 0
            or row.get("canary", {}).get("denied") is not True
            or row.get("cleanup") != {"confirmed": True, "survivingProcessCount": 0}):
        raise SystemExit("Schema receipt arm integrity failed")
source = args.source / "codex-rs/tools/src"
fixtures = pathlib.Path(__file__).resolve().parent / "fixtures/p0-r2f-serializer"
root = pathlib.Path(tempfile.mkdtemp(prefix="appraise-r2f-serializer-"))
(root / "src").mkdir()
source_files = [source / "json_schema.rs", *sorted((source / "json_schema").glob("*.rs"))]
for name in ("stock", "candidate"):
    shutil.copyfile(source / "json_schema.rs", root / "src" / f"{name}.rs")
    shutil.copytree(source / "json_schema", root / "src" / name)

# Causal demonstrator, not a production patch: retain unknown keywords in the
# existing recursive representation, then avoid compatibility lowering entirely.
types = root / "src/candidate/types.rs"
text = types.read_text()
needle = "pub struct JsonSchema {\n"
if text.count(needle) != 1:
    raise SystemExit("Unexpected upstream schema type; refusing to patch")
types.write_text(text.replace(needle, needle + "    #[serde(flatten)]\n"
                             "    pub preserved_keywords: BTreeMap<String, JsonValue>,\n", 1))
candidate = root / "src/candidate.rs"
candidate.write_text(candidate.read_text() + '''
// Disposable causal canary only; not installed in Codex or a production schema policy.
pub fn parse_lossless_dynamic_schema(input: &JsonValue) -> Result<JsonSchema, serde_json::Error> {
    if serde_json::to_vec(input)?.len() > 65536 {
        return Err(serde_json::Error::io(std::io::Error::new(std::io::ErrorKind::InvalidInput, "schema_size_limit")));
    }
    deserialize_tool_input_schema(input.clone())
}
''')
for name in ("Cargo.toml", "Cargo.lock"):
    shutil.copyfile(fixtures / name, root / name)
shutil.copyfile(fixtures / "main.rs", root / "src/main.rs")
completed = subprocess.run(
    [args.cargo, "run", "--locked", "--manifest-path", str(root / "Cargo.toml"), "--quiet"],
    input=args.receipt.read_bytes(), capture_output=True, check=True,
)
result = json.loads(completed.stdout)
result["artifactIdentities"] = {
    "inputReceiptSha256": digest(args.receipt),
    "sourceSha256": {str(path.relative_to(args.source)): digest(path) for path in source_files},
    "harnessSha256": {
        str(path): digest(path) for path in [pathlib.Path(__file__).resolve(), *sorted(fixtures.iterdir())]
    },
    "candidateTypesSha256": digest(types),
    "candidateParserSha256": digest(candidate),
    "canaryExecutableSha256": digest(root / "target/debug/appraise-r2f-serializer-canary"),
    "cargoVersion": subprocess.check_output([args.cargo, "--version"], text=True).strip(),
}
result["receiptSubjectSha256"] = hashlib.sha256(
    json.dumps(result, sort_keys=True, separators=(",", ":")).encode()
).hexdigest()
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"sourceLevelCanaryPassed": result["sourceLevelCanaryPassed"],
                  "providerQualified": False, "comparisons": len(result["results"]),
                  "receipt": str(args.output)}))
