"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupAction, createTenantAndAdmin } from "./actions";
import { Button, Card, Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

type Mode = "choose" | "join" | "create";

export default function SignupPage() {
  const [mode, setMode] = useState<Mode>("choose");
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--background)" }}>
      <div className="w-full max-w-md">
        {mode === "choose" && <ChooseMode onSelect={setMode} />}
        {mode === "join" && <JoinOrgForm onBack={() => setMode("choose")} router={router} />}
        {mode === "create" && <CreateOrgForm onBack={() => setMode("choose")} router={router} />}
      </div>
    </div>
  );
}

function ChooseMode({ onSelect }: { onSelect: (mode: Mode) => void }) {
  return (
    <Card className="w-full p-8">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Get started</h1>
      <p className="mb-8 text-sm text-zinc-600">
        Create a new organisation or join an existing one.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => onSelect("create")}
          className="w-full rounded-lg border-2 border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <p className="font-semibold text-zinc-900">Create a new organisation</p>
          <p className="mt-0.5 text-sm text-zinc-600">
            Set up a new workspace — you will become the administrator.
          </p>
        </button>
        <button
          onClick={() => onSelect("join")}
          className="w-full rounded-lg border-2 border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <p className="font-semibold text-zinc-900">Join an existing organisation</p>
          <p className="mt-0.5 text-sm text-zinc-600">
            Sign up using a company ID provided by your administrator.
          </p>
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="app-link font-medium">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

function JoinOrgForm({
  onBack,
  router,
}: {
  onBack: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    // Sign in immediately after sign up
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full p-8">
      <button onClick={onBack} className="mb-4 text-sm text-zinc-500 hover:text-zinc-700">
        ← Back
      </button>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Join organisation</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Enter the company ID provided by your administrator.
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
          {loading ? "Creating account..." : "Sign up"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="app-link font-medium">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

function CreateOrgForm({
  onBack,
  router,
}: {
  onBack: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await createTenantAndAdmin({ orgName, email, password, jobTitle });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Sign in after the admin user was created
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full p-8">
      <button onClick={onBack} className="mb-4 text-sm text-zinc-500 hover:text-zinc-700">
        ← Back
      </button>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Create organisation</h1>
      <p className="mb-6 text-sm text-zinc-600">
        You will be the administrator of the new workspace.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="orgName" className="mb-1 block text-sm font-medium text-zinc-700">
            Organisation name
          </label>
          <Input
            id="orgName"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            placeholder="e.g. Acme Engineering"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
            Your email
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
            Your job title <span className="text-zinc-400">(optional)</span>
          </label>
          <Input
            id="jobTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Managing Director"
          />
        </div>
        {error && <p className="app-alert app-alert-error">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating organisation..." : "Create organisation"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="app-link font-medium">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
