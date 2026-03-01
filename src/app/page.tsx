import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "var(--background)" }}>
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold text-zinc-900 sm:text-5xl">
          Capacity Intelligence Platform
        </h1>
        <p className="mb-8 text-lg text-zinc-700">
          Plan capacity, track utilisation, and monitor project health for your engineering consulting firm.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/login"
            className="app-btn app-btn-primary focus-ring px-6 py-3"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="app-btn app-btn-secondary focus-ring px-6 py-3"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
