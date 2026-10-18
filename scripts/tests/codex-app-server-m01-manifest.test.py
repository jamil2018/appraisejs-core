"""Deterministic manifest parsing regressions. No CLI, sockets, auth or inference."""

import importlib.util
import pathlib
import sys
import unittest

sys.dont_write_bytecode = True
source = (
    pathlib.Path(__file__).parent
    / "fixtures/codex-app-server-m01/mcp-elicitation-probe.py"
)
spec = importlib.util.spec_from_file_location("m01_manifest", source)
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class ManifestInspection(unittest.TestCase):
    def test_standard_responses_direct_tool(self):
        report = fixture.inspect_tool_manifest(
            {"tools": [{"type": "function", "name": "mcp__fixture__elicit"}]}
        )
        self.assertTrue(report["topLevelToolsPresent"])
        self.assertEqual(report["manifestLocations"], ["tools"])
        self.assertEqual(report["toolNames"], ["mcp__fixture__elicit"])

    def test_responses_lite_namespace_does_not_mean_empty_manifest(self):
        body = {
            "input": [
                {
                    "type": "additional_tools",
                    "role": "developer",
                    "tools": [
                        {
                            "type": "namespace",
                            "name": "functions",
                            "description": "synthetic hidden guidance",
                            "tools": [
                                {
                                    "type": "custom",
                                    "name": "exec",
                                    "description": "synthetic schema text",
                                },
                                {
                                    "type": "function",
                                    "name": "wait",
                                    "parameters": {"synthetic": "ignored"},
                                },
                            ],
                        }
                    ],
                },
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "must not persist"}],
                },
            ]
        }
        report = fixture.inspect_tool_manifest(body)
        self.assertFalse(report["topLevelToolsPresent"])
        self.assertEqual(report["manifestLocations"], ["input[0].additional_tools"])
        self.assertEqual(report["toolNames"], ["functions.exec", "functions.wait"])
        self.assertNotIn("hidden guidance", str(report))
        self.assertNotIn("schema text", str(report))
        self.assertNotIn("must not persist", str(report))

    def test_empty_manifest_is_distinct_from_uninspected_location(self):
        report = fixture.inspect_tool_manifest({"tools": [], "input": []})
        self.assertTrue(report["topLevelToolsPresent"])
        self.assertEqual(report["manifestLocations"], ["tools"])
        self.assertEqual(report["toolNames"], [])

    def test_rejects_malformed_tool_locations(self):
        for body in [
            {"tools": {}},
            {"input": [{"type": "additional_tools", "role": "user", "tools": []}]},
            {"tools": [{"type": "namespace", "name": "fixture", "tools": {}}]},
            {"tools": [{"type": "function"}]},
        ]:
            with self.subTest(body=body), self.assertRaises((ValueError, TypeError)):
                fixture.inspect_tool_manifest(body)


if __name__ == "__main__":
    unittest.main()
