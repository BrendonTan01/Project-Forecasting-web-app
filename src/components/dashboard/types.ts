export type ExplanationEntry =
  { type: "proposal" | "leave" | "project"; name: string; impact_hours: number };

export interface ForecastWeek {
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
  best_case_demand: number;
  expected_demand: number;
  worst_case_demand: number;
  proposal_demands?: Array<{
    proposal_id: string;
    raw_hours: number;
    expected_hours: number;
  }>;
  forecast_explanation?: ExplanationEntry[];
}

export interface ForecastProposal {
  id: string;
  name: string;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  estimated_hours: number | null;
  estimated_hours_per_week: number | null;
  has_complete_dates: boolean;
}

export interface HiringRecommendation {
  skill: string;
  staff_needed: number;
  recommended_hiring_window_weeks: number;
  shortage_start_week?: string;
  demand_sources?: Array<{ project_name: string; hours_per_week: number }>;
}

export interface SkillShortage {
  skill: string;
  weekly_demand: number;
  available_capacity: number;
  shortage: number;
}

export interface ForecastResponse {
  weeks: ForecastWeek[];
  hiring_recommendations: HiringRecommendation[];
  skill_shortages: SkillShortage[];
  proposals: ForecastProposal[];
}
