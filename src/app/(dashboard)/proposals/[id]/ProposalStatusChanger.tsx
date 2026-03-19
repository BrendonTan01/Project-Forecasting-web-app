"use client";

import { useState, useTransition } from "react";
import { updateProposalStatus } from "../actions";

type Status = "draft" | "submitted" | "won" | "lost";

const statusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700 border-zinc-300" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700 border-blue-200" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700 border-red-200" },
};

const ALL_STATUSES: Status[] = ["draft", "submitted", "won", "lost"];

interface Props {
  proposalId: string;
  currentStatus: Status;
  hasTimeline: boolean;
}

export function ProposalStatusChanger({ proposalId, currentStatus, hasTimeline }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const config = statusConfig[currentStatus] ?? {
    label: currentStatus,
    colour: "bg-zinc-100 text-zinc-700 border-zinc-300",
  };

  function handleSelect(newStatus: Status) {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const result = await updateProposalStatus(proposalId, newStatus);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${config.colour} ${isPending ? "opacity-60 cursor-not-allowed" : "hover:opacity-80 cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isPending ? "Updating…" : config.label}
        {!isPending && (
          <svg
            className="h-3 w-3 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Dropdown */}
          <ul
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1.5 min-w-[10rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {ALL_STATUSES.map((s) => {
              const isDisabled = s !== "draft" && !hasTimeline;
              const isCurrent = s === currentStatus;
              const cfg = statusConfig[s];
              return (
                <li key={s} role="option" aria-selected={isCurrent}>
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelect(s)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      isDisabled
                        ? "cursor-not-allowed opacity-40"
                        : isCurrent
                        ? "bg-zinc-50 font-medium"
                        : "hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.colour}`}
                    >
                      {cfg.label}
                    </span>
                    {isCurrent && (
                      <svg
                        className="ml-auto h-3.5 w-3.5 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isDisabled && (
                      <span className="ml-auto text-xs text-zinc-400">needs dates</span>
                    )}
                  </button>
                </li>
              );
            })}
            <li className="border-t border-zinc-100 px-3 py-2">
              <p className="text-xs text-zinc-400">
                To convert, first set status to Won, then use Convert to Project.
              </p>
            </li>
          </ul>
        </>
      )}

      {error && (
        <p className="absolute left-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 shadow-sm z-20">
          {error}
        </p>
      )}
    </div>
  );
}
