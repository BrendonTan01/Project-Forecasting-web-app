export const PROPOSAL_OPTIMIZATION_MODES = [
  "max_feasibility",
  "min_staff_count",
  "single_office_preferred",
  "multi_office_balanced",
  "min_overallocation",
  "worst_week_robust",
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
};

export const PROPOSAL_OPTIMIZATION_COMPARISON_MODES: ProposalOptimizationMode[] = [
  "max_feasibility",
  "min_staff_count",
  "single_office_preferred",
  "min_overallocation",
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
