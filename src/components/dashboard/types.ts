export type ExplanationEntry =
  | { type: "proposal"; name: string; impact_hours: number }
  | { type: "leave"; staff: string; impact_hours: number }
  | { type: "project"; name: string; impact_hours: number };

export interface ForecastWeek {
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
  best_case_demand: number;
  expected_demand: number;
  worst_case_demand: number;
  forecast_explanation?: ExplanationEntry[];
}

export interface HiringRecommendation {
  skill: string;
  staff_needed: number;
  recommended_hiring_window_weeks: number;
  shortage_start_week?: string;
  demand_sources?: Array<{ project_name: string; hours_per_week: number }>;
}

export interface ForecastResponse {
  weeks: ForecastWeek[];
  hiring_recommendations: HiringRecommendation[];
}
