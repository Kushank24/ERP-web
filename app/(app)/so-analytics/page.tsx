"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type SoData = {
  totals: {
    total: number;
    total_revenue: number;
    not_received: number;
    partial: number;
    received: number;
    overdue: number;
    payment_collection_rate: number;
  };
  monthly: Array<{ month: string; count: number; value: number; payment: number }>;
  top_customers: Array<{ company_name: string; total_amount: number }>;
};

type CustomerSummary = {
  name: string;
  total_sos: number;
  last_so: string | null;
};

type CustomerDetail = {
  summary: {
    total_sos: number;
    total_revenue: number;
    payment_received_total: number;
    payment_rate_pct: number;
    overdue: number;
  };
  sos: Array<{
    id: number;
    invoice_number: string;
    sales_date: string | null;
    delivery_date: string | null;
    actual_delivery_date: string | null;
    status: number;
    total_amount: number;
    payment_amount: number | null;
    items: Array<{
      product_name: string;
      quantity_sold: number;
      unit_price: number;
      total_price: number;
    }>;
  }>;
  top_products: Array<{ product_name: string; total_qty: number }>;
  monthly_trend: Array<{ month: string; count: number; value: number; payment: number }>;
};

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (n > 0) return `₹${n.toLocaleString()}`;
  return "₹0";
}

function fmtL(n: number): string {
  return `₹${(n / 1e5).toFixed(1)} L`;
}

function trunc(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

// ── Shared constants ──────────────────────────────────────────────────────────

const GRID = <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />;
const X_TICK = { fill: "#64748b", fontSize: 10 };
const Y_TICK = { fill: "#64748b", fontSize: 10 };
const TT_STYLE = {
  contentStyle: { background: "#0f1419", border: "1px solid #1e2530", borderRadius: 8, fontSize: 12 },
};

const C = {
  blue:   "#3b82f6",
  green:  "#22c55e",
  red:    "#ef4444",
  orange: "#f97316",
  amber:  "#f59e0b",
  indigo: "#6366f1",
  slate:  "#64748b",
  teal:   "#14b8a6",
};

// SO payment status: 1=Not Received, 2=Partially Received, 3=Received
const SO_STATUS_LABEL: Record<number, string> = {
  1: "Not Received",
  2: "Partially Received",
  3: "Received",
};

const SO_STATUS_CLS: Record<number, string> = {
  1: "bg-red-500/15 text-red-400 border-red-500/30",
  2: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  3: "bg-green-500/15 text-green-400 border-green-500/30",
};

function SoBadge({ status }: { status: number }) {
  const cls = SO_STATUS_CLS[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {SO_STATUS_LABEL[status] ?? `Status ${status}`}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.04] ${className}`} />;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "text-white", accent,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; accent?: string;
}) {
  return (
    <div className={`rounded-xl border bg-[#0f1419] p-5 ${accent ?? "border-surface-border"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Donut legend ──────────────────────────────────────────────────────────────

function DonutLegend({ items }: { items: { name: string; value: number; fill: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {items.map((e) => (
        <div key={e.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: e.fill }} />
          {e.name}
          <span className="text-slate-500">({e.value})</span>
        </div>
      ))}
    </div>
  );
}

// ── Lazy section ──────────────────────────────────────────────────────────────

function LazySection({ children, skeleton }: { children: React.ReactNode; skeleton: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return <div ref={ref}>{visible ? children : skeleton}</div>;
}

// ── SO Preview Modal ──────────────────────────────────────────────────────────

function SoPreviewModal({ soId, onClose }: { soId: number; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    api(`/api/v1/sales-orders/${soId}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [soId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl rounded-xl border border-surface-border bg-[#0f1419] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sales Order Preview</p>
          <button onClick={onClose} className="text-lg leading-none text-slate-500 transition-colors hover:text-white">×</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              <Sk className="h-5 w-40" /><Sk className="h-4 w-32" /><Sk className="h-24" />
            </div>
          )}
          {err && <p className="text-sm text-red-400">Failed to load: {err}</p>}
          {data && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-white">{data.invoice_number}</p>
                  <p className="text-xs text-slate-500">
                    {data.company_name ?? "—"} · {fmtDate(data.sales_date)}
                  </p>
                </div>
                <SoBadge status={data.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Total</p>
                  <p className="mt-1 text-sm font-bold text-green-400">{fmtCr(data.total_amount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Payment Received</p>
                  <p className="mt-1 text-sm font-bold text-blue-400">
                    {data.payment_amount != null ? fmtCr(data.payment_amount) : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Delivery</p>
                  <p className="mt-1 text-sm font-medium text-white">{fmtDate(data.delivery_date)}</p>
                </div>
              </div>

              {data.items?.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Items</p>
                  <div className="overflow-hidden rounded-lg border border-surface-border">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((it: { product_name: string; quantity_sold: number; unit_price: number; total_price: number }, i: number) => (
                          <tr key={i} className="border-b border-surface-border/50">
                            <td className="px-3 py-1.5 text-slate-200">{it.product_name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{it.quantity_sold}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">₹{it.unit_price.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-green-400">₹{it.total_price.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.notes && (
                <p className="text-[11px] italic text-slate-500">"{data.notes}"</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-surface-border px-5 py-3">
          <Link
            href={`/sales-orders?id=${soId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 hover:text-green-300"
          >
            Open in Sales Orders page →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Customer Selector ─────────────────────────────────────────────────────────

function CustomerSelector({
  customers, selected, onSelect,
}: { customers: CustomerSummary[]; selected: string | null; onSelect: (name: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search customer…"
        className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-green-500/50"
      />
      <div className="max-h-[420px] overflow-y-auto space-y-px pr-0.5">
        {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No customers found</p>}
        {filtered.map((c) => (
          <button
            key={c.name} onClick={() => onSelect(c.name)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
              selected === c.name ? "bg-green-600/20 text-white" : "text-slate-300 hover:bg-white/[0.04]"
            }`}
          >
            <p className="truncate text-[13px] font-medium leading-tight">{c.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {c.total_sos} SOs{c.last_so ? ` · ${fmtDate(c.last_so)}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Customer Detail Panel ─────────────────────────────────────────────────────

function CustomerDetailPanel({
  detail, onSoPreview,
}: { detail: CustomerDetail; onSoPreview: (id: number) => void }) {
  const { summary, sos, top_products, monthly_trend } = detail;
  const [activeTab, setActiveTab] = useState<"history" | "products" | "trend">("history");

  return (
    <div className="flex flex-col gap-5">
      {/* Summary KPIs */}
      <div className="rounded-xl border border-green-800/30 bg-green-950/10 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total SOs",        value: summary.total_sos,                              color: "" },
            { label: "Total Revenue",    value: fmtCr(summary.total_revenue),                   color: "text-green-400" },
            { label: "Pymt Received",    value: fmtCr(summary.payment_received_total),           color: "text-blue-400" },
            { label: "Collection Rate",  value: `${summary.payment_rate_pct}%`,                 color: summary.payment_rate_pct >= 80 ? "text-green-400" : "text-amber-400" },
            { label: "Overdue",          value: summary.overdue,                                color: summary.overdue > 0 ? "text-red-400" : "text-green-400" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">{k.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${k.color || "text-white"}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-surface-border bg-[#0b0f14] p-1">
        {(["history", "products", "trend"] as const).map((tab) => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
              activeTab === tab ? "bg-green-600/25 text-green-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "history" ? "Order History" : tab === "products" ? "Products Sold" : "Monthly Trend"}
          </button>
        ))}
      </div>

      {/* Tab: Order History */}
      {activeTab === "history" && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 520 }}>
          {sos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No sales orders</p>}
          {sos.map((so, i) => {
            const isOverdue = so.delivery_date && !so.actual_delivery_date
              && so.delivery_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={i} className="rounded-lg border border-surface-border bg-[#0b0f14] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => onSoPreview(so.id)}
                      className="text-left text-[12px] font-semibold text-white hover:text-green-400 hover:underline"
                    >
                      {so.invoice_number}
                    </button>
                    <p className="text-[10px] text-slate-500">
                      {fmtDate(so.sales_date)}
                      {so.delivery_date && ` · Delivery: ${fmtDate(so.delivery_date)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SoBadge status={so.status} />
                    {isOverdue && (
                      <span className="text-[10px] font-semibold text-red-400">Overdue</span>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <p className="text-[11px] font-semibold text-green-400">{fmtCr(so.total_amount)}</p>
                  {so.payment_amount != null && (
                    <p className="text-[11px] text-blue-400">Paid: {fmtCr(so.payment_amount)}</p>
                  )}
                </div>
                {so.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {so.items.slice(0, 4).map((it, j) => (
                      <span key={j} className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {trunc(it.product_name, 22)} × {it.quantity_sold}
                      </span>
                    ))}
                    {so.items.length > 4 && (
                      <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                        +{so.items.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Products Sold */}
      {activeTab === "products" && (
        <div className="space-y-3">
          {top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No product data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(top_products.length * 32, 160)}>
                <BarChart
                  layout="vertical"
                  data={top_products.map((p) => ({ name: trunc(p.product_name, 28), qty: p.total_qty }))}
                  margin={{ top: 2, right: 40, left: 8, bottom: 0 }}
                >
                  {GRID}
                  <XAxis type="number" tick={X_TICK} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={180} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [v, "Units sold"]) as never} />
                  <Bar dataKey="qty" name="Qty sold" fill={C.green} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_products.map((p, i) => (
                      <tr key={i} className="border-b border-surface-border/50 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-200">{p.product_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-400">{p.total_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Monthly Trend */}
      {activeTab === "trend" && (
        <div className="space-y-4">
          {monthly_trend.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No trend data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} />
                  <Tooltip {...TT_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="count" name="SOs" stroke={C.green} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                  <Tooltip
                    {...TT_STYLE}
                    formatter={((v: unknown, name: unknown) => [fmtL(v as number), name]) as never}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Bar dataKey="value"   name="Revenue"  fill={C.green} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="payment" name="Payments" fill={C.blue}  radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {(() => {
                const totalSOs  = monthly_trend.reduce((s, m) => s + m.count,   0);
                const totalRev  = monthly_trend.reduce((s, m) => s + m.value,   0);
                const totalPaid = monthly_trend.reduce((s, m) => s + m.payment, 0);
                const peakMonth = monthly_trend.reduce((best, m) =>
                  m.count > (best?.count ?? 0) ? m : best, monthly_trend[0]);
                const collectionRate = totalRev > 0 ? Math.round((totalPaid / totalRev) * 100) : 0;
                return (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300">Pattern Insights</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {peakMonth && <li>Peak month: <span className="text-white">{peakMonth.month}</span> ({peakMonth.count} SOs)</li>}
                      <li>Avg SOs/month: <span className="text-green-400">{(totalSOs / Math.max(monthly_trend.length, 1)).toFixed(1)}</span></li>
                      <li>Total revenue over period: <span className="text-green-400">{fmtCr(totalRev)}</span></li>
                      <li>Payment collection rate: <span className={collectionRate >= 80 ? "text-green-400" : "text-amber-400"}>{collectionRate}%</span></li>
                    </ul>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Date Range Picker ─────────────────────────────────────────────────────────

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function DateRangePicker({
  from, to, onChange,
}: {
  from: string; to: string;
  onChange: (from: string, to: string) => void;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = fmtIso(now);

  const presets = [
    { label: "This Month", from: fmtIso(new Date(y, m, 1)),     to: today },
    { label: "Last 3M",    from: fmtIso(new Date(y, m - 3, 1)), to: today },
    { label: "Last 6M",    from: fmtIso(new Date(y, m - 6, 1)), to: today },
    { label: "This Year",  from: fmtIso(new Date(y, 0, 1)),      to: today },
    { label: "All Time",   from: "",                              to: ""   },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange(p.from, p.to)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            from === p.from && to === p.to
              ? "border-green-500 bg-green-500/20 text-green-400"
              : "border-surface-border text-slate-400 hover:border-slate-500 hover:text-white"
          }`}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date" value={from}
        onChange={(e) => onChange(e.target.value, to)}
        className="rounded border border-surface-border bg-[#0f1419] px-2 py-1 text-xs text-white [color-scheme:dark]"
      />
      <span className="text-xs text-slate-500">to</span>
      <input
        type="date" value={to}
        onChange={(e) => onChange(from, e.target.value)}
        className="rounded border border-surface-border bg-[#0f1419] px-2 py-1 text-xs text-white [color-scheme:dark]"
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SoAnalyticsPage() {
  const [data, setData] = useState<SoData | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewSoId, setPreviewSoId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const openSoPreview = useCallback((id: number) => setPreviewSoId(id), []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString() ? `?${params}` : "";

    setLoading(true);
    setError(null);
    Promise.all([
      api<SoData>(`/api/v1/analytics/so${qs}`),
      api<CustomerSummary[]>("/api/v1/analytics/so/customers"),
    ])
      .then(([so, cus]) => {
        setData(so);
        setCustomers(cus);
        setLoading(false);
        if (cus.length > 0) setSelectedCustomer(cus[0].name);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setDetailLoading(true);
    setCustomerDetail(null);
    api<CustomerDetail>(`/api/v1/analytics/so/customer?name=${encodeURIComponent(selectedCustomer)}`)
      .then((d) => { setCustomerDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedCustomer]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-6 text-sm text-red-400">
        Failed to load SO analytics: {error}
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const statusPie = data ? [
    { name: "Not Received",       value: data.totals.not_received, fill: C.red   },
    { name: "Partially Received", value: data.totals.partial,      fill: C.amber },
    { name: "Received",           value: data.totals.received,     fill: C.green },
  ].filter((x) => x.value > 0) : [];

  const customersBarData = data
    ? [...data.top_customers].sort((a, b) => a.total_amount - b.total_amount).map((c) => ({
        name:  trunc(c.company_name, 22),
        value: c.total_amount,
      }))
    : [];

  return (
    <>
    {previewSoId !== null && <SoPreviewModal soId={previewSoId} onClose={() => setPreviewSoId(null)} />}
    <div className="space-y-6">

      {/* ── Date Range Picker ── */}
      <div className="space-y-2">
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />
        {(dateFrom || dateTo) && (
          <p className="text-xs text-slate-400">
            Showing data {dateFrom ? `from ${dateFrom}` : ""}{dateFrom && dateTo ? " " : ""}{dateTo ? `to ${dateTo}` : ""}
          </p>
        )}
      </div>

      {/* ── KPI Row ── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-[#0f1419] p-5">
              <Sk className="mb-2 h-3 w-20" /><Sk className="h-7 w-24" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total SOs"        value={data.totals.total.toLocaleString()} />
          <KpiCard label="Total Revenue"    value={fmtCr(data.totals.total_revenue)} color="text-green-400" />
          <KpiCard label="Payment Received" value={data.totals.received.toLocaleString()} color="text-green-400" />
          <KpiCard label="Partial Payment"  value={data.totals.partial.toLocaleString()} color="text-amber-400" />
          <KpiCard label="Pending Payment"  value={data.totals.not_received.toLocaleString()} color="text-red-400" />
          <KpiCard
            label="Overdue"
            value={data.totals.overdue.toLocaleString()}
            color={data.totals.overdue > 0 ? "text-red-400" : "text-green-400"}
            accent={data.totals.overdue > 0 ? "border-red-800/40" : undefined}
          />
        </div>
      ) : null}

      {/* ── Customer Intelligence ── */}
      <Card title="Customer Intelligence">
        {loading ? (
          <Sk className="h-96" />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            <div className="lg:border-r lg:border-surface-border lg:pr-4">
              <p className="mb-2 text-[11px] text-slate-500">
                {customers.length} customers — select to explore
              </p>
              <CustomerSelector
                customers={customers}
                selected={selectedCustomer}
                onSelect={setSelectedCustomer}
              />
            </div>
            <div className="min-w-0">
              {selectedCustomer === null && (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <p className="text-3xl">📦</p>
                  <p className="mt-3 text-sm">Select a customer to see their order history, products sold, and payment trends.</p>
                </div>
              )}
              {detailLoading && (
                <div className="space-y-3">
                  <Sk className="h-24" /><Sk className="h-10" /><Sk className="h-64" />
                </div>
              )}
              {customerDetail && !detailLoading && (
                <CustomerDetailPanel detail={customerDetail} onSoPreview={openSoPreview} />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Monthly Revenue ── */}
      <LazySection skeleton={<Sk className="h-[320px] w-full" />}>
        {loading ? (
          <Sk className="h-[320px] w-full" />
        ) : data ? (
          <Card title="Monthly Revenue — Orders · Payments">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="month" tick={X_TICK} />
                <YAxis tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                <Tooltip
                  {...TT_STYLE}
                  formatter={((v: unknown, name: unknown) => [fmtL(v as number), name]) as never}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="value"   name="Revenue"  fill={C.green} radius={[3, 3, 0, 0]} />
                <Bar dataKey="payment" name="Payments" fill={C.blue}  radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : null}
      </LazySection>

      {/* ── Payment Status Donut + Top Customers ── */}
      <LazySection skeleton={
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Sk className="h-[300px]" /><Sk className="h-[300px]" />
        </div>
      }>
        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Sk className="h-[300px]" /><Sk className="h-[300px]" />
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Payment Status Breakdown">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {statusPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip {...TT_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <DonutLegend items={statusPie} />
              {data.totals.total > 0 && (
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  Collection rate: <span className={data.totals.payment_collection_rate >= 80 ? "text-green-400" : "text-amber-400"}>
                    {data.totals.payment_collection_rate}%
                  </span>
                </p>
              )}
            </Card>

            <Card title="Top Customers by Revenue">
              {customersBarData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No customer data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(customersBarData.length * 32, 200)}>
                  <BarChart layout="vertical" data={customersBarData}
                    margin={{ top: 2, right: 60, left: 8, bottom: 0 }}>
                    {GRID}
                    <XAxis type="number" tick={X_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={160} />
                    <Tooltip {...TT_STYLE} formatter={((v: unknown) => [fmtL(v as number), "Revenue"]) as never} />
                    <Bar dataKey="value" name="Revenue" fill={C.green} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        ) : null}
      </LazySection>

    </div>
    </>
  );
}
