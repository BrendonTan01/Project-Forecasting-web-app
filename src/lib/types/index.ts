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
  role: UserRole;
  office_id: string | null;
  created_at?: string;
}

export interface StaffProfile {
  id: string;
  user_id: string;
  tenant_id: string;
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
export type ProposalCostSourcePreference = "manual_first" | "derived_first";

export interface ProjectProposal {
  id: string;
  tenant_id: string;
  name: string;
  client_name: string | null;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  estimated_hours: number | null;
  expected_revenue: number | null;
  manual_estimated_cost: number | null;
  derived_estimated_cost_override: number | null;
  risk_allowance_amount: number | null;
  win_probability_percent: number | null;
  schedule_confidence_percent: number | null;
  cross_office_dependency_percent: number | null;
  client_quality_score: number | null;
  cost_source_preference: ProposalCostSourcePreference;
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
  project_id: string;
  staff_id: string;
  allocation_percentage: number;
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

export type ProjectHealthStatus = "on_track" | "at_risk" | "overrun" | "no_estimate";
