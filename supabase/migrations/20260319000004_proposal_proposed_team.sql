-- Add proposed_team JSONB column to project_proposals
-- Stores the user-curated delivery team as an array of {staff_id, split_percent} objects.
-- This persists independently of simulation runs so the team is never lost when a
-- new simulation is executed.
ALTER TABLE project_proposals ADD COLUMN IF NOT EXISTS proposed_team JSONB DEFAULT NULL;
