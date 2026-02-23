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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold text-zinc-900">
          Capacity Intelligence Platform
        </h1>
        <p className="mb-8 text-lg text-zinc-600">
          Plan capacity, track utilisation, and monitor project health for your engineering consulting firm.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-zinc-300 px-6 py-3 font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
