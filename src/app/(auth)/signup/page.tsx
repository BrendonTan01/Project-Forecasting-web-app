"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Office {
  id: string;
  name: string;
  country: string;
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState<"exec" | "manager" | "staff">("staff");
  const [officeId, setOfficeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState("");
  const [billableRate, setBillableRate] = useState("");
  const [costRate, setCostRate] = useState("");
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchTenants() {
      const client = createClient();
      const { data } = await client
        .from("tenants")
        .select("id, name")
        .order("name");
      if (data) setTenants(data);
      if (data?.length === 1) setTenantId(data[0].id);
    }
    fetchTenants();
  }, []);

  useEffect(() => {
    if (!tenantId) {
      setOffices([]);
      setOfficeId("");
      return;
    }
    async function fetchOffices() {
      const client = createClient();
      const { data } = await client
        .from("offices")
        .select("id, name, country")
        .eq("tenant_id", tenantId)
        .order("name");
      if (data) {
        setOffices(data);
        setOfficeId("");
      }
    }
    fetchOffices();
  }, [tenantId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!tenantId) {
      setError("Please select a company");
      setLoading(false);
      return;
    }

    const metadata: Record<string, string | number | undefined> = {
      tenant_id: tenantId,
      role,
    };
    if (officeId) metadata.office_id = officeId;
    if (jobTitle.trim()) metadata.job_title = jobTitle.trim();
    const capacity = parseFloat(weeklyCapacityHours);
    if (!isNaN(capacity) && capacity > 0) metadata.weekly_capacity_hours = capacity;
    const billable = parseFloat(billableRate);
    if (!isNaN(billable) && billable > 0) metadata.billable_rate = billable;
    const cost = parseFloat(costRate);
    if (!isNaN(cost) && cost > 0) metadata.cost_rate = cost;

    const client = createClient();
    const { error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          Create account
        </h1>
        <p className="mb-6 text-sm text-zinc-600">
          Join your organization&apos;s Capacity Intelligence Platform
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tenant" className="mb-1 block text-sm font-medium text-zinc-700">
              Company
            </label>
            <select
              id="tenant"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Select company</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-zinc-700">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "exec" | "manager" | "staff")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="exec">Executive</option>
            </select>
          </div>
          <div>
            <label htmlFor="office" className="mb-1 block text-sm font-medium text-zinc-700">
              Office
            </label>
            <select
              id="office"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Select office (optional)</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.country})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jobTitle" className="mb-1 block text-sm font-medium text-zinc-700">
              Job title
            </label>
            <input
              id="jobTitle"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Engineer"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="weeklyCapacity" className="mb-1 block text-sm font-medium text-zinc-700">
              Weekly capacity (hours)
            </label>
            <input
              id="weeklyCapacity"
              type="number"
              min="0.5"
              max="168"
              step="0.5"
              value={weeklyCapacityHours}
              onChange={(e) => setWeeklyCapacityHours(e.target.value)}
              placeholder="40 (default)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="billableRate" className="mb-1 block text-sm font-medium text-zinc-700">
                Billable rate
              </label>
              <input
                id="billableRate"
                type="number"
                min="0"
                step="0.01"
                value={billableRate}
                onChange={(e) => setBillableRate(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label htmlFor="costRate" className="mb-1 block text-sm font-medium text-zinc-700">
                Cost rate
              </label>
              <input
                id="costRate"
                type="number"
                min="0"
                step="0.01"
                value={costRate}
                onChange={(e) => setCostRate(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
