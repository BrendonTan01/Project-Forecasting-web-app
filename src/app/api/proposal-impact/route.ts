import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { simulateProposalImpact } from "@/lib/forecast/simulate";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const proposalId = searchParams.get("proposalId");
  const officeIdsParam = searchParams.get("officeIds");
  const officeIds =
    officeIdsParam && officeIdsParam.trim().length > 0
      ? officeIdsParam
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : null;

  if (!proposalId) {
    return NextResponse.json(
      { error: "Missing required query parameter: proposalId" },
      { status: 400 }
    );
  }

  try {
    const result = await simulateProposalImpact(proposalId, user.tenantId, undefined, officeIds);

    if (!result) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Simulation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
