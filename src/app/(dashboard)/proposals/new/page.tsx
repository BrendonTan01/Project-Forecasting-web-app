import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { ProposalForm } from "../ProposalForm";

export default async function NewProposalPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role !== "administrator") {
    redirect("/proposals");
  }

  const supabase = await createClient();
  const { data: offices } = await supabase
    .from("offices")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/proposals" className="text-sm text-zinc-600 hover:underline">
          ← Proposals
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Add new proposal</h1>
      </div>
      <ProposalForm offices={offices ?? []} />
    </div>
  );
}
