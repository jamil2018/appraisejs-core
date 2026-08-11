# Validation Design Contracts

Validation designs are immutable, requirement-aligned descriptions of executable quality checks. A design identifies its Quality Plan revision, obligation coverage, exact operations, locators and resources, runtime matrix, and scenario graph.

AppraiseJS checks and previews a proposed design before compilation. Compilation validates the AST, creates canonical projections and managed runtime inputs, and records stable content hashes. Publication makes a Validation Version available to an Assessment only after the associated Quality Plan revision is approved.

Published validations are never changed in place. Any requirement, operation, locator, resource, scenario, or matrix change creates a new design revision and publication identity. Assessment readiness rejects unpublished or stale validations and verifies the selected version remains aligned with its Quality Plan revision.

The validation runtime consumes only canonical operation definitions and their shared handlers. Custom project steps remain explicit extensions with their own validated identifiers and provenance. Generated automation projections are derived from canonical source and are never hand-edited.
