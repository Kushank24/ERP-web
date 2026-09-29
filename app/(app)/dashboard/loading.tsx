function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-border/30 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Pulse className="h-8 w-40" />
        <Pulse className="h-4 w-56" />
      </div>

      {/* Key metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
            <Pulse className="h-3 w-24 rounded" />
            <Pulse className="h-8 w-16 rounded-lg" />
            <Pulse className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Work orders row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
            <Pulse className="h-3 w-20 rounded" />
            <Pulse className="h-8 w-12 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Pipeline columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
            <Pulse className="h-5 w-36" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <Pulse className="h-4 w-32" />
                <Pulse className="h-4 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
