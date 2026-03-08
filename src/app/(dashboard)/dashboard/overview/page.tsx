import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-page-title">Dashboard Overview (Alias Page)</h1>
        <p className="app-page-subtitle">
          This alias intentionally remains visible for manual review.
        </p>
      </div>
      <DashboardOverviewClient weeks={12} />
    </div>
  );
}
