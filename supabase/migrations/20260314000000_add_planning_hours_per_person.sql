ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS planning_hours_per_person_per_week NUMERIC(5,2) NOT NULL DEFAULT 40
CHECK (planning_hours_per_person_per_week > 0 AND planning_hours_per_person_per_week <= 168);
