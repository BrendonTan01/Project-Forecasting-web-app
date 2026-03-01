"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupAction } from "./actions";
import { Button, Card, Input } from "@/components/ui/primitives";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const capacity = parseFloat(weeklyCapacityHours);
    const result = await signupAction({
      email,
      password,
      companyId,
      jobTitle,
      weeklyCapacityHours: !isNaN(capacity) ? capacity : undefined,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--background)" }}>
      <Card className="w-full max-w-md p-8">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          Create account
        </h1>
        <p className="mb-6 text-sm text-zinc-700">
          Join your organization&apos;s Capacity Intelligence Platform using your company ID
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="companyId" className="mb-1 block text-sm font-medium text-zinc-700">
              Company ID
            </label>
            <Input
              id="companyId"
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
              autoComplete="off"
              placeholder="UUID provided by your administrator"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label htmlFor="jobTitle" className="mb-1 block text-sm font-medium text-zinc-700">
              Job title
            </label>
            <Input
              id="jobTitle"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Engineer"
            />
          </div>
          <div>
            <label htmlFor="weeklyCapacity" className="mb-1 block text-sm font-medium text-zinc-700">
              Weekly capacity (hours)
            </label>
            <Input
              id="weeklyCapacity"
              type="number"
              min="0.5"
              max="168"
              step="0.5"
              value={weeklyCapacityHours}
              onChange={(e) => setWeeklyCapacityHours(e.target.value)}
              placeholder="40 (default)"
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
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-700">
          Already have an account?{" "}
          <Link href="/login" className="app-link font-medium">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
