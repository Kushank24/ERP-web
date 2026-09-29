function Pulse({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-xl bg-surface-border/30 ${className}`} style={style} />;
}

export default function EmailCampaignsLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Pulse className="h-8 w-48" />
        <Pulse className="h-4 w-72" />
      </div>

      {/* Compose card */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-6 space-y-4">
        <Pulse className="h-5 w-32" />
        <Pulse className="h-9 w-full rounded-lg" />
        <Pulse className="h-9 w-full rounded-lg" />
        {/* Editor placeholder */}
        <Pulse className="h-[280px] w-full rounded-lg" />
        <div className="flex justify-end">
          <Pulse className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Campaign list */}
      <div className="rounded-xl border border-surface-border overflow-hidden">
        <div className="border-b border-surface-border px-4 py-3 flex gap-6">
          {[120, 80, 64, 80].map((w, i) => (
            <Pulse key={i} className="h-3 rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b border-surface-border/60 px-4 py-4 flex gap-6 items-center">
            {[140, 72, 80, 96, 48].map((w, j) => (
              <Pulse key={j} className="h-3.5 rounded" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
