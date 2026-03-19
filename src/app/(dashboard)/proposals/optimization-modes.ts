export const PROPOSAL_OPTIMIZATION_MODES = [
  "max_feasibility",
  "min_staff_count",
  "single_office_preferred",
  "multi_office_balanced",
  "min_overallocation",
  "worst_week_robust",
  "even_load",
  "skill_coverage_max",
] as const;

export type ProposalOptimizationMode = (typeof PROPOSAL_OPTIMIZATION_MODES)[number];

export const DEFAULT_PROPOSAL_OPTIMIZATION_MODE: ProposalOptimizationMode = "max_feasibility";

export const PROPOSAL_OPTIMIZATION_MODE_LABELS: Record<ProposalOptimizationMode, string> = {
  max_feasibility: "Max feasibility",
  min_staff_count: "Minimum staff allocated",
  single_office_preferred: "Single office preferred",
  multi_office_balanced: "Multi-office balanced",
  min_overallocation: "Minimum overallocation",
  worst_week_robust: "Worst-week robust",
  even_load: "Even load distribution",
  skill_coverage_max: "Skill coverage maximization",
};

export const PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS: Record<ProposalOptimizationMode, string> = {
  max_feasibility: "Maximizes achievable hours from the available team capacity.",
  min_staff_count:
    "Covers the workload with as few staff as possible by skipping staff who can only contribute a small amount.",
  single_office_preferred: "Keeps allocation concentrated in one office where feasible.",
  multi_office_balanced: "Spreads allocation across offices in proportion to capacity.",
  min_overallocation:
    "Prioritizes staff with headroom below 100% to reduce overallocation, using a limited overallocation buffer as fallback.",
  worst_week_robust:
    "Hard cap at 100% allocation per staff — never overallocates anyone, accepting lower feasibility to preserve headroom.",
  even_load:
    "Distributes hours as evenly as possible across all in-scope staff rather than concentrating on the most available.",
  skill_coverage_max:
    "Prioritises breadth of skill coverage — ensures every required skill gets partial coverage before any skill is fully covered. Falls back to max feasibility when no skill demand model is set.",
};

export const PROPOSAL_OPTIMIZATION_COMPARISON_MODES: ProposalOptimizationMode[] = [
  "max_feasibility",
  "min_staff_count",
  "min_overallocation",
  "even_load",
];

export const PROPOSAL_OPTIMIZATION_OFFICE_MODES: ProposalOptimizationMode[] = [
  "single_office_preferred",
  "multi_office_balanced",
];

export function isProposalOptimizationMode(value: string): value is ProposalOptimizationMode {
  return PROPOSAL_OPTIMIZATION_MODES.includes(value as ProposalOptimizationMode);
}

export function normalizeProposalOptimizationMode(value: unknown): ProposalOptimizationMode {
  if (typeof value === "string" && isProposalOptimizationMode(value)) {
    return value;
  }
  return DEFAULT_PROPOSAL_OPTIMIZATION_MODE;
}
