-- Add 'converted' status to project_proposals to represent proposals that have
-- been promoted to an active project via the conversion pipeline.
ALTER TABLE public.project_proposals
  DROP CONSTRAINT IF EXISTS project_proposals_status_check;

ALTER TABLE public.project_proposals
  ADD CONSTRAINT project_proposals_status_check
    CHECK (status IN ('draft', 'submitted', 'won', 'lost', 'converted'));
