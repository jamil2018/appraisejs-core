-- A managed capsule/tuple rejection is neither a target failure nor an
-- infrastructure result. Persist its narrow classification so read models can
-- expose not_evaluated without treating every unsealed INCONCLUSIVE cell as
-- an integrity failure.
ALTER TABLE "AssessmentRunBinding" ADD COLUMN "integrityRejectionCode" TEXT;
