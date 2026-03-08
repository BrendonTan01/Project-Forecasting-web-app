import { getInvitationByToken } from "./actions";
import InviteAcceptForm from "./InviteAcceptForm";
import { Card } from "@/components/ui/primitives";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getInvitationByToken(token);

  if (result.error || !result.invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--background)" }}>
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Invalid invitation</h1>
          <p className="text-sm text-zinc-600">{result.error ?? "Invitation not found."}</p>
          <p className="mt-4 text-sm text-zinc-500">
            Contact your administrator for a new invitation link.
          </p>
        </Card>
      </div>
    );
  }

  const inv = result.invitation;

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--background)" }}>
      <Card className="w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Accept invitation</h1>
        <p className="mb-1 text-sm text-zinc-600">
          You have been invited to join{" "}
          <span className="font-semibold text-zinc-900">{inv.tenantName}</span> as{" "}
          <span className="font-medium text-zinc-800">{inv.role}</span>.
        </p>
        <p className="mb-6 text-sm text-zinc-500">
          Account will be created for: <span className="font-mono text-zinc-700">{inv.email}</span>
        </p>
        <InviteAcceptForm token={token} email={inv.email} />
      </Card>
    </div>
  );
}
