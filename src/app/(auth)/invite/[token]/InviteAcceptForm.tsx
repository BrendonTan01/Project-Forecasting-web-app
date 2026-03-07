"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "./actions";
import { Button, Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

export default function InviteAcceptForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [password, setPassword] = useState("");
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
    const result = await acceptInvitation({
      token,
      password,
      jobTitle: jobTitle || undefined,
      weeklyCapacityHours: !isNaN(capacity) && capacity > 0 ? capacity : undefined,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Sign in immediately after account creation
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
        <p className="app-input cursor-not-allowed bg-zinc-50 text-zinc-500">{email}</p>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
          Set a password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Min. 8 characters"
        />
      </div>
      <div>
        <label htmlFor="jobTitle" className="mb-1 block text-sm font-medium text-zinc-700">
          Job title <span className="text-zinc-400">(optional)</span>
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
          Weekly capacity <span className="text-zinc-400">(hours, optional)</span>
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
      {error && <p className="app-alert app-alert-error">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating account..." : "Accept invitation"}
      </Button>
    </form>
  );
}
