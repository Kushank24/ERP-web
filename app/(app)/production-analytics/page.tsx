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

type ProductionData = {
  work_orders: {
    total: number;
    in_progress: number;
    completed: number;
    pending: number;
    cancelled: number;
    completion_rate_pct: number;
    overdue: number;
    with_deadline: number;
  };
  inventory: {
    total_materials: number;
    total_value: number;
    low_stock: number;
    out_of_stock: number;
    healthy: number;
  };
  monthly_wo: Array<{ month: string; total: number; done: number }>;
  top_clients: Array<{ name: string; count: number; completed: number }>;
  top_materials: Array<{ name: string; value: number; qty: number; unit: string }>;
  mat_monthly: Array<{ month: string; count: number }>;
};

type ClientSummary = {
  name: string;
  total: number;
  completed: number;
  in_progress: number;
  last_wo: string | null;
};

type ClientDetail = {
  client: { name: string };
  summary: { total_wo: number; completed: number; overdue: number; completion_rate: number };
  work_orders: Array<{
    id: number; wo_number: string; po_number: string | null;
    creation_date: string | null; delivery_date: string | null;
    status: string; remarks: string | null;
    products: Array<{ product: string; quantity: number }>;
  }>;
  top_products: Array<{ product: string; quantity: number }>;
  monthly_trend: Array<{ month: string; total: number; completed: number }>;
};

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString()}`;
}

function fmtL(n: number): string {
  return `₹${(n / 1e5).toFixed(1)} L`;
}

function trunc(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Shared ────────────────────────────────────────────────────────────────────

const GRID = <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />;
const X_TICK = { fill: "#64748b", fontSize: 10 };
const Y_TICK = { fill: "#64748b", fontSize: 10 };
const TT_STYLE = {
  contentStyle: {
    background: "#0f1419",
    border: "1px solid #1e2530",
    borderRadius: 8,
    fontSize: 12,
  },
};

const C = {
  blue:   "#3b82f6",
  green:  "#22c55e",
  red:    "#ef4444",
  orange: "#f97316",
  indigo: "#6366f1",
  slate:  "#64748b",
  teal:   "#14b8a6",
};

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

// ── Chart Card ────────────────────────────────────────────────────────────────

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
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

// ── Donut legend row ──────────────────────────────────────────────────────────

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

// ── Lazy section (mounts when scrolled into view) ─────────────────────────────

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

// ── Status colours ────────────────────────────────────────────────────────────

const WO_STATUS_CLS: Record<string, string> = {
  completed:    "bg-green-500/15 text-green-400 border-green-500/30",
  "in-progress": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  pending:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled:    "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function WoBadge({ status }: { status: string }) {
  const cls = WO_STATUS_CLS[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

// ── WO Preview Modal ──────────────────────────────────────────────────────────

function WoPreviewModal({ woId, onClose }: { woId: number; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    api(`/api/v1/work-orders/${woId}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [woId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-surface-border bg-[#0f1419] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Work Order Preview</p>
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
                  <p className="text-base font-bold text-white">{data.work_order_number}</p>
                  <p className="text-xs text-slate-500">
                    {data.party_name ?? "—"} · Created {fmtDate(data.creation_date)}
                  </p>
                </div>
                <WoBadge status={data.status} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {data.po_number && (
                  <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600">PO Number</p>
                    <p className="mt-1 text-sm font-medium text-white">{data.po_number}</p>
                  </div>
                )}
                {data.delivery_date && (
                  <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600">Delivery Date</p>
                    <p className={`mt-1 text-sm font-medium ${
                      data.status !== "completed" && data.delivery_date < new Date().toISOString().slice(0, 10)
                        ? "text-red-400" : "text-white"
                    }`}>{fmtDate(data.delivery_date)}</p>
                  </div>
                )}
              </div>

              {data.products?.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Products</p>
                  <div className="overflow-hidden rounded-lg border border-surface-border">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Issued</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((p: { product_name: string; quantity: number; issued_qty: number }, i: number) => (
                          <tr key={i} className="border-b border-surface-border/50">
                            <td className="px-3 py-1.5 text-slate-200">{p.product_name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{p.quantity}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{p.issued_qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.remarks && (
                <p className="text-[11px] italic text-slate-500">"{data.remarks}"</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-surface-border px-5 py-3">
          <Link href={`/work-orders?id=${woId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300">
            Open in Work Orders page →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Client Selector ───────────────────────────────────────────────────────────

function ClientSelector({
  clients, selected, onSelect,
}: { clients: ClientSummary[]; selected: string | null; onSelect: (name: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search client…"
        className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-orange-500/50"
      />
      <div className="max-h-[420px] overflow-y-auto space-y-px pr-0.5">
        {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No clients found</p>}
        {filtered.map((c) => (
          <button
            key={c.name} onClick={() => onSelect(c.name)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
              selected === c.name ? "bg-orange-600/20 text-white" : "text-slate-300 hover:bg-white/[0.04]"
            }`}
          >
            <p className="truncate text-[13px] font-medium leading-tight">{c.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {c.total} WOs · {c.completed} done
              {c.last_wo && ` · ${fmtDate(c.last_wo)}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Client Detail Panel ───────────────────────────────────────────────────────

function ClientDetailPanel({ detail, onWoPreview }: { detail: ClientDetail; onWoPreview: (id: number) => void }) {
  const { client, summary, work_orders, top_products, monthly_trend } = detail;
  const [activeTab, setActiveTab] = useState<"wos" | "products" | "trend">("wos");

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="rounded-xl border border-orange-800/30 bg-orange-950/10 p-4">
        <h2 className="text-base font-bold text-white">{client.name}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total WOs",       value: summary.total_wo,                           color: "" },
            { label: "Completed",        value: summary.completed,                          color: "text-green-400" },
            { label: "Overdue",          value: summary.overdue,                            color: summary.overdue > 0 ? "text-red-400" : "text-green-400" },
            { label: "Completion Rate",  value: `${summary.completion_rate}%`,              color: "text-green-400" },
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
        {(["wos", "products", "trend"] as const).map((tab) => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors capitalize ${
              activeTab === tab ? "bg-orange-600/25 text-orange-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "wos" ? "Work Order History" : tab === "products" ? "Products Ordered" : "Monthly Trend"}
          </button>
        ))}
      </div>

      {/* Tab: WO History */}
      {activeTab === "wos" && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 520 }}>
          {work_orders.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No work orders</p>}
          {work_orders.map((wo, i) => (
            <div key={i} className="rounded-lg border border-surface-border bg-[#0b0f14] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    onClick={() => onWoPreview(wo.id)}
                    className="text-left text-[12px] font-semibold text-white hover:text-orange-400 hover:underline"
                  >
                    {wo.wo_number}
                  </button>
                  {wo.po_number && <p className="text-[10px] text-slate-500">PO: {wo.po_number}</p>}
                </div>
                <WoBadge status={wo.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
                <span>Created: {fmtDate(wo.creation_date)}</span>
                {wo.delivery_date && (
                  <span className={
                    wo.status !== "completed" && wo.delivery_date < new Date().toISOString().slice(0, 10)
                      ? "text-red-400" : ""
                  }>
                    Delivery: {fmtDate(wo.delivery_date)}
                  </span>
                )}
              </div>
              {wo.products.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {wo.products.map((p, j) => (
                    <span key={j} className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {trunc(p.product, 22)} × {p.quantity}
                    </span>
                  ))}
                </div>
              )}
              {wo.remarks && (
                <p className="mt-1.5 text-[10px] italic text-slate-500">"{wo.remarks}"</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Products */}
      {activeTab === "products" && (
        <div className="space-y-3">
          {top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No product data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(top_products.length * 32, 160)}>
                <BarChart
                  layout="vertical"
                  data={top_products.map((p) => ({ name: trunc(p.product, 28), qty: p.quantity }))}
                  margin={{ top: 2, right: 40, left: 8, bottom: 0 }}
                >
                  {GRID}
                  <XAxis type="number" tick={X_TICK} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={180} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [v, "Units ordered"]) as never} />
                  <Bar dataKey="qty" name="Qty ordered" fill={C.orange} radius={[0, 3, 3, 0]} />
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
                        <td className="px-3 py-2 text-slate-200">{p.product}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-400">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Trend */}
      {activeTab === "trend" && (
        <div className="space-y-4">
          {monthly_trend.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No trend data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} />
                  <Tooltip {...TT_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="total"     name="Created"   stroke={C.orange} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke={C.green}  strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {(() => {
                const totalOrdered   = monthly_trend.reduce((s, m) => s + m.total,     0);
                const totalCompleted = monthly_trend.reduce((s, m) => s + m.completed, 0);
                const peakMonth      = monthly_trend.reduce((best, m) => m.total > (best?.total ?? 0) ? m : best, monthly_trend[0]);
                return (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300">Pattern Insights</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {peakMonth && <li>Peak order month: <span className="text-white">{peakMonth.month}</span> ({peakMonth.total} WOs)</li>}
                      <li>Avg WOs/month: <span className="text-orange-400">{(totalOrdered / Math.max(monthly_trend.length, 1)).toFixed(1)}</span></li>
                      <li>Overall completion over period: <span className={totalCompleted / Math.max(totalOrdered, 1) >= 0.8 ? "text-green-400" : "text-orange-400"}>
                        {Math.round((totalCompleted / Math.max(totalOrdered, 1)) * 100)}%
                      </span></li>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductionAnalyticsPage() {
  const [data, setData] = useState<ProductionData | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewWoId, setPreviewWoId] = useState<number | null>(null);
  const openWoPreview = useCallback((id: number) => setPreviewWoId(id), []);

  useEffect(() => {
    Promise.all([
      api<ProductionData>("/api/v1/analytics/production"),
      api<ClientSummary[]>("/api/v1/analytics/production/clients"),
    ])
      .then(([prod, cls]) => {
        setData(prod);
        setClients(cls);
        setLoading(false);
        // Auto-select most-recent client so the panel isn't blank on load
        if (cls.length > 0) setSelectedClient(cls[0].name);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedClient) return;
    setDetailLoading(true);
    setClientDetail(null);
    api<ClientDetail>(`/api/v1/analytics/production/client?name=${encodeURIComponent(selectedClient)}`)
      .then((d) => { setClientDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedClient]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-6 text-sm text-red-400">
        Failed to load production analytics: {error}
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const woPie = data ? [
    { name: "Completed",   value: data.work_orders.completed,   fill: C.green  },
    { name: "In Progress", value: data.work_orders.in_progress, fill: C.orange },
    { name: "Pending",     value: data.work_orders.pending,     fill: C.blue   },
    { name: "Cancelled",   value: data.work_orders.cancelled,   fill: C.slate  },
  ].filter((x) => x.value > 0) : [];

  const invPie = data ? [
    { name: "Healthy",      value: data.inventory.healthy,      fill: C.green  },
    { name: "Low Stock",    value: data.inventory.low_stock,    fill: C.orange },
    { name: "Out of Stock", value: data.inventory.out_of_stock, fill: C.red    },
  ].filter((x) => x.value > 0) : [];

  const clientsData = data
    ? [...data.top_clients].sort((a, b) => a.count - b.count).map((c) => ({
        name:      trunc(c.name),
        total:     c.count,
        completed: c.completed,
      }))
    : [];

  const materialsData = data
    ? [...data.top_materials].sort((a, b) => a.value - b.value).map((m) => ({
        name:  trunc(m.name),
        value: m.value,
        qty:   m.qty,
        unit:  m.unit,
      }))
    : [];

  const overdueRate = data?.work_orders.with_deadline
    ? Math.round((data.work_orders.overdue / data.work_orders.with_deadline) * 100)
    : 0;

  return (
    <>
    {previewWoId !== null && <WoPreviewModal woId={previewWoId} onClose={() => setPreviewWoId(null)} />}
    <div className="space-y-6">

      {/* ── KPI Row ── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-[#0f1419] p-5">
              <Sk className="mb-2 h-3 w-20" />
              <Sk className="h-7 w-24" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Total Work Orders"
            value={data.work_orders.total.toLocaleString()}
          />
          <KpiCard
            label="In Progress"
            value={data.work_orders.in_progress.toLocaleString()}
            color="text-orange-400"
          />
          <KpiCard
            label="Completed"
            value={data.work_orders.completed.toLocaleString()}
            color="text-green-400"
            sub={`${data.work_orders.completion_rate_pct}% rate`}
          />
          <KpiCard
            label="Overdue"
            value={data.work_orders.overdue.toLocaleString()}
            color={data.work_orders.overdue > 0 ? "text-red-400" : "text-green-400"}
            sub={data.work_orders.with_deadline > 0 ? `${overdueRate}% of scheduled` : undefined}
            accent={data.work_orders.overdue > 0 ? "border-red-800/40" : undefined}
          />
          <KpiCard
            label="Inventory Value"
            value={fmtCr(data.inventory.total_value)}
            sub={`${data.inventory.total_materials} materials`}
          />
          <KpiCard
            label="Stock Alerts"
            value={`${data.inventory.low_stock + data.inventory.out_of_stock}`}
            color={data.inventory.out_of_stock > 0 ? "text-red-400" : "text-orange-400"}
            sub={`${data.inventory.low_stock} low · ${data.inventory.out_of_stock} out`}
            accent={data.inventory.out_of_stock > 0 ? "border-orange-800/40" : undefined}
          />
        </div>
      ) : null}

      {/* ── Client Intelligence ── */}
      <Card title="Client Intelligence">
        {loading ? (
          <Sk className="h-96" />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            <div className="lg:border-r lg:border-surface-border lg:pr-4">
              <p className="mb-2 text-[11px] text-slate-500">
                {clients.length} clients — select to explore
              </p>
              <ClientSelector
                clients={clients}
                selected={selectedClient}
                onSelect={setSelectedClient}
              />
            </div>
            <div className="min-w-0">
              {selectedClient === null && (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <p className="text-3xl">🏭</p>
                  <p className="mt-3 text-sm">Select a client to see their work order history, products manufactured, and delivery trends.</p>
                </div>
              )}
              {detailLoading && (
                <div className="space-y-3">
                  <Sk className="h-24" /><Sk className="h-10" /><Sk className="h-64" />
                </div>
              )}
              {clientDetail && !detailLoading && (
                <ClientDetailPanel detail={clientDetail} onWoPreview={openWoPreview} />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Monthly Work Orders ── */}
      <LazySection skeleton={<Sk className="h-[320px] w-full" />}>
        {loading ? (
          <Sk className="h-[320px] w-full" />
        ) : data ? (
          <Card title="Monthly Work Orders — Created vs Completed">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.monthly_wo} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="month" tick={X_TICK} />
                <YAxis tick={Y_TICK} />
                <Tooltip {...TT_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="total" name="Created"   fill={C.blue}  radius={[3, 3, 0, 0]} />
                <Bar dataKey="done"  name="Completed" fill={C.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : null}
      </LazySection>

      {/* ── WO Status + Inventory Health ── */}
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
            <Card title="Work Order Status">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={woPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value">
                    {woPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip {...TT_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <DonutLegend items={woPie} />
            </Card>

            <Card title="Inventory Health">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={invPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value">
                    {invPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip {...TT_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <DonutLegend items={invPie} />
            </Card>
          </div>
        ) : null}
      </LazySection>

      {/* ── Top Clients ── */}
      <LazySection skeleton={<Sk className="h-[360px] w-full" />}>
        {loading ? (
          <Sk className="h-[360px] w-full" />
        ) : data ? (
          <Card title="Top Clients by Work Orders">
            {clientsData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No client data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(clientsData.length * 36, 200)}>
                <BarChart layout="vertical" data={clientsData}
                  margin={{ top: 4, right: 50, left: 8, bottom: 0 }}>
                  {GRID}
                  <XAxis type="number" tick={X_TICK} />
                  <YAxis type="category" dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 10 }} width={160} />
                  <Tooltip {...TT_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Bar dataKey="total"     name="Total"     fill={C.blue}  radius={[0, 3, 3, 0]} />
                  <Bar dataKey="completed" name="Completed" fill={C.green} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        ) : null}
      </LazySection>

      {/* ── Top Materials ── */}
      <LazySection skeleton={<Sk className="h-[360px] w-full" />}>
        {loading ? (
          <Sk className="h-[360px] w-full" />
        ) : data ? (
          <Card title="Top Materials by Inventory Value">
            {materialsData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No materials data available</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(materialsData.length * 36, 200)}>
                  <BarChart layout="vertical" data={materialsData}
                    margin={{ top: 4, right: 70, left: 8, bottom: 0 }}>
                    {GRID}
                    <XAxis type="number" tick={X_TICK}
                      tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                    <YAxis type="category" dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 10 }} width={160} />
                    <Tooltip {...TT_STYLE}
                      formatter={((v: unknown) => [fmtL(v as number), "Value"]) as never} />
                    <Bar dataKey="value" name="Inventory Value" fill={C.indigo} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Material detail table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[11px] text-slate-400">
                    <thead>
                      <tr className="border-b border-surface-border text-left text-[10px] uppercase tracking-wider text-slate-600">
                        <th className="pb-2 pr-4">Material</th>
                        <th className="pb-2 pr-4 text-right">Qty</th>
                        <th className="pb-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.top_materials].sort((a, b) => b.value - a.value).map((m, i) => (
                        <tr key={i} className="border-b border-surface-border/50">
                          <td className="py-1.5 pr-4 font-medium text-slate-300">{m.name}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">
                            {m.qty.toFixed(1)} {m.unit}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-indigo-400">
                            {fmtL(m.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        ) : null}
      </LazySection>

    </div>
    </>
  );
}
