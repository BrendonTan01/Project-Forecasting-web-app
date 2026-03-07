"use client";

import { useState } from "react";
import { createOffice, updateOffice } from "./actions";
import { Button, Input } from "@/components/ui/primitives";

type OfficeFormProps = {
  mode: "create";
  onSuccess?: () => void;
} | {
  mode: "edit";
  officeId: string;
  defaultValues: {
    name: string;
    country: string;
    timezone: string;
    weekly_working_hours: number;
  };
  onSuccess?: () => void;
};

export default function OfficeForm(props: OfficeFormProps) {
  const defaults =
    props.mode === "edit"
      ? props.defaultValues
      : { name: "", country: "", timezone: "UTC", weekly_working_hours: 40 };

  const [name, setName] = useState(defaults.name);
  const [country, setCountry] = useState(defaults.country);
  const [timezone, setTimezone] = useState(defaults.timezone);
  const [hours, setHours] = useState(String(defaults.weekly_working_hours));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const data = {
      name,
      country,
      timezone,
      weekly_working_hours: parseFloat(hours),
    };

    const result =
      props.mode === "edit"
        ? await updateOffice(props.officeId, data)
        : await createOffice(data);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      props.onSuccess?.();
      if (props.mode === "create") {
        setName("");
        setCountry("");
        setTimezone("UTC");
        setHours("40");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Office name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. London HQ" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Country</label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} required placeholder="e.g. United Kingdom" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Timezone</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} required placeholder="e.g. Europe/London" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Weekly working hours</label>
          <Input
            type="number"
            min="1"
            max="168"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="app-alert app-alert-error">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading
          ? props.mode === "create" ? "Creating..." : "Saving..."
          : props.mode === "create" ? "Add office" : "Save changes"}
      </Button>
    </form>
  );
}
