export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3">
      <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200" />
      <div className="ml-auto h-4 w-16 animate-pulse rounded bg-zinc-200" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-2 h-3 w-1/3 rounded bg-zinc-200" />
      <div className="h-7 w-1/2 rounded bg-zinc-200" />
    </div>
  );
}

export default function PageLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />

      {/* KPI card row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {/* Table header */}
        <div className="flex gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-zinc-200" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
