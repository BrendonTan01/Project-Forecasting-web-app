-- Add notes column to projects so proposal notes carry over on conversion.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add source_proposal_id to trace which proposal a project originated from.
-- SET NULL on proposal deletion so the project record is not affected.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_proposal_id UUID
    REFERENCES public.project_proposals(id) ON DELETE SET NULL;
