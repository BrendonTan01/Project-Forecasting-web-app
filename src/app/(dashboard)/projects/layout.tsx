import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  if (user.role === "staff") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
