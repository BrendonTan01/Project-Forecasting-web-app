import CapacityPlannerPage from "../capacity-planner/page";

export default async function CapacityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-page-title">Capacity (Alias Page)</h1>
        <p className="app-page-subtitle">
          This alias intentionally remains visible for manual review.
        </p>
      </div>
      <CapacityPlannerPage />
    </div>
  );
}
