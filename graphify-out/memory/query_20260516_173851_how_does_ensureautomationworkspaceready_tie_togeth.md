---
type: "query"
date: "2026-05-16T17:38:51.182723+00:00"
question: "How does ensureAutomationWorkspaceReady tie together test-run creation, cucumber runtime, and locator-picker companion launches across package boundaries?"
contributor: "graphify"
source_nodes: ["ensureAutomationWorkspaceReady()", "LocalExecutorAdapter", "LocatorPickerSessionManager", "bootstrap()"]
---

# Q: How does ensureAutomationWorkspaceReady tie together test-run creation, cucumber runtime, and locator-picker companion launches across package boundaries?

## Answer

ensureAutomationWorkspaceReady is a singleton gate that prepares the automation/ workspace (dirs, legacy migration, step import rewrites). Test runs call it via winston-logger and LocalExecutorAdapter before npx cucumber-js. Locator picker uses a parallel ensureLocatorPickerDirectories under .tmp/locator-picker and resolveLocatorPickerCompanionInvocation/build via execa—not ensureAutomationWorkspaceReady directly. Both subsystems share TaskSpawner/execa process patterns and depend on projected files under automation/features and automation/locators.

## Source Nodes

- ensureAutomationWorkspaceReady()
- LocalExecutorAdapter
- LocatorPickerSessionManager
- bootstrap()