-- The unified Step Definition registry is the only reusable behavior authority.
-- This unreleased migration intentionally discards retired compatibility and
-- Step Block rows rather than preserving an ambiguous second identity.
DROP TABLE IF EXISTS "StepCompatibilityReference";
DROP TABLE IF EXISTS "StepBlockStep";
DROP TABLE IF EXISTS "StepBlock";
