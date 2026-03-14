import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant, getCurrentStaffId } from "@/lib/supabase/auth-helpers";
import { Badge } from "@/components/ui/primitives";
import LeaveRequestForm from "./LeaveRequestForm";
import { ApproveRejectButtons, DeleteLeaveButton } from "./LeaveStatusActions";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function statusVariant(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "approved": return "success";
    case "rejected": return "danger";
    default: return "warning";
  }
}

export default async function LeavePage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();
  const isManager = user.role !== "staff";

  if (isManager) {
    // Manager/admin view: all tenant leave requests, grouped by status
    const { data: allRequests } = await supabase
      .from("leave_requests")
      .select(`
        id,
        start_date,
        end_date,
        leave_type,
        status,
        created_at,
        staff_profiles (
          id,
          name,
          users (name, email)
        )
      `)
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false });

    const pending = (allRequests ?? []).filter((r) => r.status === "pending");
    const decided = (allRequests ?? []).filter((r) => r.status !== "pending");

    function renderTable(
      requests: typeof allRequests,
      showActions: boolean
    ) {
      if (!requests || requests.length === 0) {
        return <p className="text-sm text-zinc-500">None.</p>;
      }
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Start</th>
                <th className="pb-2">End</th>
                <th className="pb-2">Status</th>
                {showActions && <th className="pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const sp = Array.isArray(r.staff_profiles) ? r.staff_profiles[0] : r.staff_profiles;
                const usersRaw = sp ? (sp as unknown as { users?: unknown }).users : null;
                const displayName = getStaffDisplayName(
                  (sp as { name?: string | null } | null)?.name,
                  usersRaw
                );
                return (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="py-2 text-sm text-zinc-800">{displayName}</td>
                    <td className="py-2 text-sm capitalize text-zinc-700">{r.leave_type}</td>
                    <td className="py-2 text-sm text-zinc-800">{formatDate(r.start_date)}</td>
                    <td className="py-2 text-sm text-zinc-800">{formatDate(r.end_date)}</td>
                    <td className="py-2">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </td>
                    {showActions && (
                      <td className="py-2">
                        <ApproveRejectButtons
                          leaveRequestId={r.id}
                          currentStatus={r.status}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="app-page-title">Leave requests</h1>
          <p className="text-sm text-zinc-600">
            Review and approve or reject leave requests from your team.
          </p>
        </div>

        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-zinc-900">Pending approval</h2>
          {renderTable(pending, true)}
        </div>

        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-zinc-900">Decided requests</h2>
          {renderTable(decided, false)}
        </div>

        {/* Submit own leave */}
        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-zinc-900">Submit your own leave request</h2>
          <LeaveRequestForm />
        </div>
      </div>
    );
  }

  // Staff view: own leave requests only
  const staffId = await getCurrentStaffId();

  const { data: myRequests } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, leave_type, status, created_at")
    .eq("staff_id", staffId ?? "")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-page-title">My leave</h1>
        <p className="text-sm text-zinc-600">
          Submit and track your leave requests.
        </p>
      </div>

      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Request leave</h2>
        <LeaveRequestForm />
      </div>

      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">My requests</h2>
        {myRequests && myRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Start</th>
                  <th className="pb-2">End</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="py-2 text-sm capitalize text-zinc-800">{r.leave_type}</td>
                    <td className="py-2 text-sm text-zinc-800">{formatDate(r.start_date)}</td>
                    <td className="py-2 text-sm text-zinc-800">{formatDate(r.end_date)}</td>
                    <td className="py-2">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="py-2">
                      {r.status === "pending" && (
                        <DeleteLeaveButton leaveRequestId={r.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No leave requests yet.</p>
        )}
      </div>
    </div>
  );
}
