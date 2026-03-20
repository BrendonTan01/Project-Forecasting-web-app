"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui/primitives";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[color:var(--surface)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-[color:color-mix(in_srgb,var(--accent-soft)_25%,transparent)] blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] blur-3xl" />
      </div>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[color:#131b2e] text-white shadow-sm">
              <span aria-hidden className="text-lg">A</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Capacity Intelligence Platform
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted-text)]">Sign in to your account</p>
          </div>

          <Card className="w-full p-8 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-5">
          <div>
                <label htmlFor="email" className="mb-2 block label-sm text-[color:var(--muted-text)]">
                  Email address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="label-sm text-[color:var(--muted-text)]">
                    Password
                  </label>
                  <span className="text-xs font-medium text-[color:var(--muted-text)]">Forgot password?</span>
                </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <p className="app-alert app-alert-error">{error}</p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
          </Card>

          <p className="mt-6 text-center text-sm text-[color:var(--muted-text)]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="app-link font-semibold">
              Sign up
            </Link>
          </p>
        </div>
      </main>

      <footer className="relative z-10 px-4 pb-8">
        <div className="mx-auto flex max-w-md justify-center gap-6 text-xs text-zinc-500">
          <span>Privacy Policy</span>
          <span>Terms</span>
          <span>Security</span>
        </div>
      </footer>
    </div>
  );
}
