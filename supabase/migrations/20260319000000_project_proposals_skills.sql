-- Add structured skills needed field for proposal setup/edit.
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS skills JSONB;

COMMENT ON COLUMN public.project_proposals.skills IS
  'JSON array of required skill entries for the proposal (e.g. [{ "id": "<uuid>", "name": "Design" }]).';
