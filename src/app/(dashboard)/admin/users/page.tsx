import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { Badge } from "@/components/ui/primitives";
import Link from "next/link";
import InviteUserForm from "./InviteUserForm";
import UserRoleSelect from "./UserRoleSelect";
import { revokeInvitation } from "@/app/(auth)/invite/[token]/actions";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

async function RevokeInviteButton({ id }: { id: string }) {
  async function revoke() {
    "use server";
    await revokeInvitation(id);
  }
  return (
    <form action={revoke}>
      <button type="submit" className="text-sm text-zinc-500 hover:text-red-600">
        Revoke
      </button>
    </form>
  );
}

export default async function AdminUsersPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const [{ data: users }, { data: invitations }] = await Promise.all([
    supabase
      .from("users")
      .select(`
        id,
        email,
        role,
        created_at,
        offices (name, country)
      `)
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at, accepted_at, created_at")
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false }),
  ]);

  const pendingInvitations = (invitations ?? []).filter(
    (inv) => !inv.accepted_at && new Date(inv.expires_at) > new Date()
  );
  const acceptedInvitations = (invitations ?? []).filter((inv) => inv.accepted_at);
  const expiredInvitations = (invitations ?? []).filter(
    (inv) => !inv.accepted_at && new Date(inv.expires_at) <= new Date()
  );

  return (
    <div className="space-y-6">
      {/* Current users */}
      <div className="app-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-zinc-900">Users ({users?.length ?? 0})</h2>
          <Link href="/admin/skills" className="app-link text-sm text-zinc-700">
            Manage skills →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Office</th>
                <th className="pb-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const office = Array.isArray(u.offices) ? u.offices[0] : u.offices;
                const isCurrentUser = u.id === user.id;
                return (
                  <tr key={u.id} className="border-b border-zinc-100">
                    <td className="py-2 text-sm text-zinc-900">
                      {u.email}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-zinc-400">(you)</span>
                      )}
                    </td>
                    <td className="py-2">
                      {isCurrentUser ? (
                        <Badge variant="info">{u.role}</Badge>
                      ) : (
                        <UserRoleSelect userId={u.id} currentRole={u.role} />
                      )}
                    </td>
                    <td className="py-2 text-sm text-zinc-700">
                      {office
                        ? `${(office as { name: string; country: string }).name}, ${(office as { name: string; country: string }).country}`
                        : "-"}
                    </td>
                    <td className="py-2 text-sm text-zinc-600">
                      {u.created_at ? formatDate(u.created_at) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send invitation */}
      <div className="app-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-zinc-900">Invite a user</h2>
          <Link href="/admin/skills" className="app-link text-sm text-zinc-700">
            Manage skills →
          </Link>
        </div>
        <p className="mb-4 text-sm text-zinc-600">
          Generate an invite link to share. The link is valid for 7 days.
        </p>
        <InviteUserForm />
      </div>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-zinc-900">
            Pending invitations ({pendingInvitations.length})
          </h2>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Expires</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvitations.map((inv) => (
                <tr key={inv.id} className="border-b border-zinc-100">
                  <td className="py-2 text-sm text-zinc-800">{inv.email}</td>
                  <td className="py-2 text-sm capitalize text-zinc-700">{inv.role}</td>
                  <td className="py-2 text-sm text-zinc-600">{formatDate(inv.expires_at)}</td>
                  <td className="py-2">
                    <RevokeInviteButton id={inv.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Accepted invitations */}
      {(acceptedInvitations.length > 0 || expiredInvitations.length > 0) && (
        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-zinc-900">Past invitations</h2>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {[...acceptedInvitations, ...expiredInvitations].map((inv) => (
                <tr key={inv.id} className="border-b border-zinc-100">
                  <td className="py-2 text-sm text-zinc-800">{inv.email}</td>
                  <td className="py-2 text-sm capitalize text-zinc-700">{inv.role}</td>
                  <td className="py-2">
                    <Badge variant={inv.accepted_at ? "success" : "neutral"}>
                      {inv.accepted_at ? "accepted" : "expired"}
                    </Badge>
                  </td>
                  <td className="py-2 text-sm text-zinc-600">
                    {inv.accepted_at ? formatDate(inv.accepted_at) : formatDate(inv.expires_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
