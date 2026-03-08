-- Skill-based staffing: three new tables for skills, staff skill assignments,
-- and project skill requirements. No existing tables are modified.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------
-- 1) skills
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_skills_tenant
  ON public.skills(tenant_id);

-- -------------------------------------------------------------------
-- 2) staff_skills
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_skills (
  staff_id   UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  skill_id   UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_skills_tenant
  ON public.staff_skills(tenant_id);

CREATE INDEX IF NOT EXISTS idx_staff_skills_skill
  ON public.staff_skills(skill_id);

-- -------------------------------------------------------------------
-- 3) project_skill_requirements
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_skill_requirements (
  project_id              UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id                UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  required_hours_per_week NUMERIC(8,2) NOT NULL CHECK (required_hours_per_week >= 0),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_project_skill_requirements_tenant
  ON public.project_skill_requirements(tenant_id);

CREATE INDEX IF NOT EXISTS idx_project_skill_requirements_skill
  ON public.project_skill_requirements(skill_id);

-- -------------------------------------------------------------------
-- 4) RLS
-- -------------------------------------------------------------------

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_skill_requirements ENABLE ROW LEVEL SECURITY;

-- skills: all authenticated users in the tenant can view; managers/execs can manage
DROP POLICY IF EXISTS "Users can view skills" ON public.skills;
CREATE POLICY "Users can view skills"
  ON public.skills FOR SELECT
  USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "Managers can manage skills" ON public.skills;
CREATE POLICY "Managers can manage skills"
  ON public.skills FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- staff_skills: all tenant users can view; managers/execs can manage
DROP POLICY IF EXISTS "Users can view staff skills" ON public.staff_skills;
CREATE POLICY "Users can view staff skills"
  ON public.staff_skills FOR SELECT
  USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "Managers can manage staff skills" ON public.staff_skills;
CREATE POLICY "Managers can manage staff skills"
  ON public.staff_skills FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- project_skill_requirements: all tenant users can view; managers/execs can manage
DROP POLICY IF EXISTS "Users can view project skill requirements" ON public.project_skill_requirements;
CREATE POLICY "Users can view project skill requirements"
  ON public.project_skill_requirements FOR SELECT
  USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "Managers can manage project skill requirements" ON public.project_skill_requirements;
CREATE POLICY "Managers can manage project skill requirements"
  ON public.project_skill_requirements FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());
