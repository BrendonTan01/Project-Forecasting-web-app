// Database types for Capacity Intelligence Platform

export type UserRole = "manager" | "staff" | "administrator";

export interface Tenant {
  id: string;
  name: string;
  industry: string | null;
  default_currency: string | null;
  created_at: string;
}

export interface Office {
  id: string;
  tenant_id: string;
  name: string;
  country: string;
  timezone: string;
  weekly_working_hours: number;
  created_at?: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  role: UserRole;
  office_id: string | null;
  created_at?: string;
}

export interface StaffProfile {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string | null;
  job_title: string | null;
  weekly_capacity_hours: number;
  billable_rate: number | null;
  cost_rate: number | null;
  created_at?: string;
}

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  client_name: string | null;
  estimated_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at?: string;
}

export type ProposalStatus = "draft" | "submitted" | "won" | "lost";

export interface ProjectProposal {
  id: string;
  tenant_id: string;
  name: string;
  client_name: string | null;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  estimated_hours: number | null;
  estimated_hours_per_week: number | null;
  win_probability: number;
  office_scope: string[] | null;
  status: ProposalStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProposalMetricCard {
  value: number | null;
  label: string;
  completenessWarning?: string;
}

export interface ProjectAssignment {
  id: string;
  tenant_id: string;
  project_id: string;
  staff_id: string;
  allocation_percentage: number;
  weekly_hours_allocated: number;
  week_start?: string | null;
  created_at?: string;
}

export interface StaffAvailability {
  id: string;
  tenant_id: string;
  staff_id: string;
  week_start: string;
  available_hours: number;
  created_at?: string;
}

export interface ForecastResult {
  id: string;
  tenant_id: string;
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
  raw_proposal_demand?: number;
  expected_proposal_demand?: number;
  created_at?: string;
}

export type ForecastExplanationEntry =
  | { type: "proposal"; name: string; impact_hours: number }
  | { type: "leave"; staff: string; impact_hours: number };

export type HiringRecommendationType =
  | "overload"
  | "sustained_overload"
  | "underutilization"
  | "none";

export interface HiringPrediction {
  id: string;
  tenant_id: string;
  week_start: string;
  utilization_rate: number;
  hours_over_capacity: number;
  recommended_hires: number;
  recommendation_type: HiringRecommendationType;
  message: string;
  created_at?: string;
}

export interface TimeEntry {
  id: string;
  tenant_id: string;
  staff_id: string;
  project_id: string;
  date: string;
  hours: number;
  billable_flag: boolean;
  created_at?: string;
}

export interface LeaveRequest {
  id: string;
  tenant_id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
  created_at?: string;
}

export type ProjectHealthStatus = "not_started" | "on_track" | "at_risk" | "overrun" | "no_estimate";

export type InvitationStatus = "pending" | "accepted" | "expired";

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: UserRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type SubscriptionPlan = "free" | "growth" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export interface Subscription {
  id: string;
  tenant_id: string;
  stripe_customer_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditEntityType =
  | "project"
  | "proposal"
  | "leave_request"
  | "user"
  | "invitation"
  | "office"
  | "tenant";

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: AuditEntityType;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface Skill {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface StaffSkill {
  staff_id: string;
  skill_id: string;
  tenant_id: string;
  created_at: string;
}

export interface ProjectSkillRequirement {
  project_id: string;
  skill_id: string;
  required_hours_per_week: number;
  tenant_id: string;
  created_at: string;
}

export interface SkillShortage {
  skill: string;
  weekly_demand: number;
  available_capacity: number;
  shortage: number;
}

export interface HiringRecommendation {
  skill: string;
  staff_needed: number;
  recommended_hiring_window_weeks: number;
  shortage_start_week?: string;
  demand_sources?: Array<{
    project_name: string;
    hours_per_week: number;
  }>;
}
