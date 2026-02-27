-- Allow one row per tenant/staff/project/day/billable_flag combination.
-- Before adding the new uniqueness, consolidate any duplicates for the same billable bucket.

DO $$
DECLARE
  over_limit_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO over_limit_count
  FROM (
    SELECT tenant_id, staff_id, project_id, date, billable_flag
    FROM public.time_entries
    GROUP BY tenant_id, staff_id, project_id, date, billable_flag
    HAVING COUNT(*) > 1 AND SUM(hours) > 24
  ) AS x;

  IF over_limit_count > 0 THEN
    RAISE EXCEPTION
      'Cannot merge duplicate time_entries groups because summed hours exceed 24 in % billable bucket(s). Clean these rows first.',
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
    billable_flag,
    (ARRAY_AGG(id ORDER BY created_at, id))[1] AS keep_id,
    SUM(hours)::NUMERIC(5,2) AS merged_hours
  FROM public.time_entries
  GROUP BY tenant_id, staff_id, project_id, date, billable_flag
  HAVING COUNT(*) > 1
),
updated_keep_rows AS (
  UPDATE public.time_entries AS te
  SET
    hours = dg.merged_hours
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
  AND te.billable_flag = dg.billable_flag
  AND te.id <> dg.keep_id;

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_unique_staff_project_date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_entries_unique_staff_project_date_billable'
      AND conrelid = 'public.time_entries'::regclass
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_unique_staff_project_date_billable
      UNIQUE (tenant_id, staff_id, project_id, date, billable_flag);
  END IF;
END
$$;
