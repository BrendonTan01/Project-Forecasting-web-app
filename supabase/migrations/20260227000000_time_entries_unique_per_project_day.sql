-- Enforce one time entry row per tenant/staff/project/day.
-- Before adding uniqueness, consolidate any historical duplicates.

DO $$
DECLARE
  over_limit_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO over_limit_count
  FROM (
    SELECT tenant_id, staff_id, project_id, date
    FROM public.time_entries
    GROUP BY tenant_id, staff_id, project_id, date
    HAVING COUNT(*) > 1 AND SUM(hours) > 24
  ) AS x;

  IF over_limit_count > 0 THEN
    RAISE EXCEPTION
      'Cannot merge duplicate time_entries groups because summed hours exceed 24 in % group(s). Clean these rows first.',
      over_limit_count;
  END IF;
END
$$;

WITH duplicate_groups AS (
  SELECT
    tenant_id,
    staff_id,
    project_id,
    date,
    MIN(id) AS keep_id,
    SUM(hours)::NUMERIC(5,2) AS merged_hours,
    BOOL_OR(billable_flag) AS merged_billable
  FROM public.time_entries
  GROUP BY tenant_id, staff_id, project_id, date
  HAVING COUNT(*) > 1
),
updated_keep_rows AS (
  UPDATE public.time_entries AS te
  SET
    hours = dg.merged_hours,
    billable_flag = dg.merged_billable
  FROM duplicate_groups AS dg
  WHERE te.id = dg.keep_id
  RETURNING te.id
)
DELETE FROM public.time_entries AS te
USING duplicate_groups AS dg
WHERE te.tenant_id = dg.tenant_id
  AND te.staff_id = dg.staff_id
  AND te.project_id = dg.project_id
  AND te.date = dg.date
  AND te.id <> dg.keep_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_entries_unique_staff_project_date'
      AND conrelid = 'public.time_entries'::regclass
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_unique_staff_project_date
      UNIQUE (tenant_id, staff_id, project_id, date);
  END IF;
END
$$;
