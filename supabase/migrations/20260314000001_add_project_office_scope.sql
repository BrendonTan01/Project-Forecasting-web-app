ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS office_scope JSONB;

COMMENT ON COLUMN public.projects.office_scope IS
  'JSON array of office UUIDs assigned to this project. NULL means all offices in the tenant.';
