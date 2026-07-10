# Graph Report - /Users/jamil/Personal Projects/appraisejs/codex/development plan/appraise-0.5/bug fixes  (2026-07-10)

## Corpus Check
- 1 files · ~3,557 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 24 nodes · 23 edges · 6 communities (5 shown, 1 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Deterministic Runtime Packet|Deterministic Runtime Packet]]
- [[_COMMUNITY_Baseline Evidence Recovery|Baseline Evidence Recovery]]
- [[_COMMUNITY_Audit Failure Evidence|Audit Failure Evidence]]
- [[_COMMUNITY_Validation Authoring Efficiency|Validation Authoring Efficiency]]
- [[_COMMUNITY_End-to-End Lifecycle|End-to-End Lifecycle]]
- [[_COMMUNITY_Domain Requirement Extraction|Domain Requirement Extraction]]

## God Nodes (most connected - your core abstractions)
1. `Exact Managed Command Preflight` - 5 edges
2. `Invalid Empty Run Evidence` - 3 edges
3. `Evidence Preserving Baseline Classification` - 3 edges
4. `Validation Harness Failure Classification` - 3 edges
5. `Hash Bound Baseline Retry` - 3 edges
6. `Appraise Owned Execution Packet` - 3 edges
7. `Managed Test Run Diagnosis` - 3 edges
8. `Motivation Quotes Runtime Audit` - 2 edges
9. `Invalid Missing Report Evidence` - 2 edges
10. `Generated Tag And Selector Alignment` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Exact Managed Command Preflight` --shares_data_with--> `Generated Tag And Selector Alignment`  [INFERRED]
  26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md → 26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md  _Bridges community 2 → community 0_
- `Invalid Missing Report Evidence` --conceptually_related_to--> `Validation Harness Failure Classification`  [EXTRACTED]
  26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md → 26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md  _Bridges community 2 → community 1_
- `Managed Test Run Diagnosis` --references--> `Exact Managed Command Preflight`  [EXTRACTED]
  26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md → 26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md  _Bridges community 0 → community 1_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Evidence Integrity And Recovery Flow** — bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_tag_selector_alignment, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_evidence_preserving_classification, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_baseline_retry, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_validation_changes_requested [EXTRACTED 1.00]
- **Deterministic Runtime Packet Flow** — bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_appraise_owned_execution_packet, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_single_cucumber_instance, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_exact_command_preflight, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_execution_packet_review [EXTRACTED 1.00]
- **Efficient Validation Authoring Flow** — bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_confidence_bound_reuse_matching, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_draft_repair_tools, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_compact_draft_responses, bug_fixes_26_plan_builder_end_to_end_runtime_recovery_and_efficiency_server_side_resource_filtering [EXTRACTED 1.00]

## Communities (6 total, 1 thin omitted)

### Community 0 - "Deterministic Runtime Packet"
Cohesion: 0.33
Nodes (6): Appraise Owned Execution Packet, Environment Identity Normalization, Exact Managed Command Preflight, Execution Packet Review Panel, Runtime Preparation Proposal, Single Cucumber Instance

### Community 1 - "Baseline Evidence Recovery"
Cohesion: 0.40
Nodes (6): Hash Bound Baseline Retry, Evidence Preserving Baseline Classification, Managed Test Run Diagnosis, One Click Repair And Rerun, Validation Changes Requested State, Validation Harness Failure Classification

### Community 2 - "Audit Failure Evidence"
Cohesion: 0.50
Nodes (4): Motivation Quotes Runtime Audit, Invalid Empty Run Evidence, Invalid Missing Report Evidence, Generated Tag And Selector Alignment

### Community 3 - "Validation Authoring Efficiency"
Cohesion: 0.50
Nodes (4): Compact Draft Mutation Responses, Confidence Bound Reuse Matching, Hash Bound Draft Repair Tools, Server Side Resource Filtering And Context Receipts

### Community 4 - "End-to-End Lifecycle"
Cohesion: 0.67
Nodes (3): Executable Plan Builder Lifecycle, Fresh Machine End To End Acceptance, Managed TestRun Evidence

## Knowledge Gaps
- **8 isolated node(s):** `Executable Plan Builder Lifecycle`, `Validation Changes Requested State`, `Single Cucumber Instance`, `Environment Identity Normalization`, `Server Side Resource Filtering And Context Receipts` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Exact Managed Command Preflight` connect `Deterministic Runtime Packet` to `Baseline Evidence Recovery`, `Audit Failure Evidence`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `Managed Test Run Diagnosis` connect `Baseline Evidence Recovery` to `Deterministic Runtime Packet`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **What connects `Executable Plan Builder Lifecycle`, `Validation Changes Requested State`, `Single Cucumber Instance` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._