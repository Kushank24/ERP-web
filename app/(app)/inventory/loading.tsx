function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-border/30 ${className}`} />;
}

export default function InventoryLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Pulse className="h-8 w-32 rounded-xl" />
        <Pulse className="h-9 w-28 rounded-xl" />
      </div>

      {/* Summary stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
            <Pulse className="h-3 w-20" />
            <Pulse className="h-7 w-24" />
          </div>
        ))}
      </div>

      {/* Search bar */}
      <Pulse className="h-9 w-full max-w-sm rounded-xl" />

      {/* Table */}
      <div className="rounded-xl border border-surface-border overflow-hidden">
        <div className="border-b border-surface-border px-4 py-3 flex gap-6">
          {[120, 72, 64, 80, 96].map((w, i) => (
            <Pulse key={i} className="h-3 rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-surface-border/60 px-4 py-3.5 flex gap-6 items-center">
            {[140, 56, 48, 72, 80, 40].map((w, j) => (
              <Pulse key={j} className="h-3.5 rounded" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
