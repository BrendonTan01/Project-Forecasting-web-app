-- Add integer win probability for weighted proposal forecasting.
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS win_probability INTEGER NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_proposals_win_probability_range'
      AND conrelid = 'public.project_proposals'::regclass
  ) THEN
    ALTER TABLE public.project_proposals
      ADD CONSTRAINT project_proposals_win_probability_range
      CHECK (win_probability >= 0 AND win_probability <= 100);
  END IF;
END $$;
