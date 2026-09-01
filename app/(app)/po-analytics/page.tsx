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

type PoData = {
  totals: {
    total: number;
    total_value: number;
    pending: number;
    confirmed: number;
    partial: number;
    delivered: number;
    cancelled: number;
    overdue: number;
  };
  monthly: Array<{ month: string; count: number; value: number }>;
  top_suppliers: Array<{ name: string; total_amount: number }>;
  status_breakdown: Array<{ status: number; count: number }>;
};

type SupplierSummary = {
  name: string;
  total_pos: number;
  last_po: string | null;
};

type SupplierDetail = {
  summary: {
    total_pos: number;
    total_value: number;
    delivered: number;
    overdue: number;
    avg_delivery_days: number | null;
  };
  pos: Array<{
    id: number;
    purchase_number: string;
    purchase_date: string | null;
    order_delivery_date: string | null;
    actual_delivery_date: string | null;
    status: number;
    total_amount: number;
    lines: Array<{
      material_name: string;
      length_weight_nos: number;
      unit: string;
      per_unit_cost: number;
    }>;
  }>;
  top_materials: Array<{ material_name: string; total_qty: number }>;
  monthly_trend: Array<{ month: string; count: number; value: number }>;
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
  yellow: "#eab308",
  indigo: "#6366f1",
  slate:  "#64748b",
  teal:   "#14b8a6",
};

// PO status: 1=Pending, 2=Confirmed, 3=Partial Delivery, 4=Delivered, 5=Cancelled
const PO_STATUS_LABEL: Record<number, string> = {
  1: "Pending",
  2: "Confirmed",
  3: "Partial Delivery",
  4: "Delivered",
  5: "Cancelled",
};

const PO_STATUS_CLS: Record<number, string> = {
  1: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  2: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  3: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  4: "bg-green-500/15 text-green-400 border-green-500/30",
  5: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function PoBadge({ status }: { status: number }) {
  const cls = PO_STATUS_CLS[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {PO_STATUS_LABEL[status] ?? `Status ${status}`}
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

// ── PO Preview Modal ──────────────────────────────────────────────────────────

function PoPreviewModal({ poId, onClose }: { poId: number; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    api(`/api/v1/purchase-orders/${poId}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [poId]);

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
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Purchase Order Preview</p>
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
                  <p className="text-base font-bold text-white">{data.purchase_number}</p>
                  <p className="text-xs text-slate-500">
                    {data.supplier_name ?? "—"} · {fmtDate(data.purchase_date)}
                  </p>
                </div>
                <PoBadge status={data.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Total</p>
                  <p className="mt-1 text-sm font-bold text-blue-400">{fmtCr(data.total_amount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Expected Delivery</p>
                  <p className="mt-1 text-sm font-medium text-white">{fmtDate(data.order_delivery_date)}</p>
                </div>
                <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">Actual Delivery</p>
                  <p className="mt-1 text-sm font-medium text-white">{fmtDate(data.actual_delivery_date)}</p>
                </div>
              </div>

              {data.lines?.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Materials</p>
                  <div className="overflow-hidden rounded-lg border border-surface-border">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                          <th className="px-3 py-2">Material</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lines.map((l: { material_name: string; length_weight_nos: number; unit: string; per_unit_cost: number }, i: number) => (
                          <tr key={i} className="border-b border-surface-border/50">
                            <td className="px-3 py-1.5 text-slate-200">{l.material_name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{l.length_weight_nos}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{l.unit || "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">₹{l.per_unit_cost.toLocaleString()}</td>
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
          <Link
            href={`/purchase-orders?id=${poId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            Open in Purchase Orders page →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Supplier Selector ─────────────────────────────────────────────────────────

function SupplierSelector({
  suppliers, selected, onSelect,
}: { suppliers: SupplierSummary[]; selected: string | null; onSelect: (name: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search supplier…"
        className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
      />
      <div className="max-h-[420px] overflow-y-auto space-y-px pr-0.5">
        {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No suppliers found</p>}
        {filtered.map((s) => (
          <button
            key={s.name} onClick={() => onSelect(s.name)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
              selected === s.name ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-white/[0.04]"
            }`}
          >
            <p className="truncate text-[13px] font-medium leading-tight">{s.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {s.total_pos} POs{s.last_po ? ` · ${fmtDate(s.last_po)}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Supplier Detail Panel ─────────────────────────────────────────────────────

function SupplierDetailPanel({
  detail, onPoPreview,
}: { detail: SupplierDetail; onPoPreview: (id: number) => void }) {
  const { summary, pos, top_materials, monthly_trend } = detail;
  const [activeTab, setActiveTab] = useState<"history" | "materials" | "trend">("history");

  return (
    <div className="flex flex-col gap-5">
      {/* Summary KPIs */}
      <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total POs",     value: summary.total_pos,                             color: "" },
            { label: "Total Value",   value: fmtCr(summary.total_value),                    color: "text-blue-400" },
            { label: "Delivered",     value: summary.delivered,                             color: "text-green-400" },
            { label: "Overdue",       value: summary.overdue,                               color: summary.overdue > 0 ? "text-red-400" : "text-green-400" },
            { label: "Avg Days",      value: summary.avg_delivery_days != null ? `${summary.avg_delivery_days}d` : "—", color: "" },
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
        {(["history", "materials", "trend"] as const).map((tab) => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
              activeTab === tab ? "bg-blue-600/25 text-blue-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "history" ? "PO History" : tab === "materials" ? "Materials Ordered" : "Monthly Trend"}
          </button>
        ))}
      </div>

      {/* Tab: PO History */}
      {activeTab === "history" && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 520 }}>
          {pos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No purchase orders</p>}
          {pos.map((po, i) => {
            const isOverdue = po.order_delivery_date && !po.actual_delivery_date
              && po.status !== 4 && po.status !== 5
              && po.order_delivery_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={i} className="rounded-lg border border-surface-border bg-[#0b0f14] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => onPoPreview(po.id)}
                      className="text-left text-[12px] font-semibold text-white hover:text-blue-400 hover:underline"
                    >
                      {po.purchase_number}
                    </button>
                    <p className="text-[10px] text-slate-500">
                      {fmtDate(po.purchase_date)}
                      {po.order_delivery_date && ` · Due: ${fmtDate(po.order_delivery_date)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <PoBadge status={po.status} />
                    {isOverdue && (
                      <span className="text-[10px] font-semibold text-red-400">Overdue</span>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-blue-400">{fmtCr(po.total_amount)}</p>
                {po.lines.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {po.lines.slice(0, 5).map((l, j) => (
                      <span key={j} className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {trunc(l.material_name, 22)} × {l.length_weight_nos} {l.unit}
                      </span>
                    ))}
                    {po.lines.length > 5 && (
                      <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                        +{po.lines.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Materials Ordered */}
      {activeTab === "materials" && (
        <div className="space-y-3">
          {top_materials.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No material data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(top_materials.length * 32, 160)}>
                <BarChart
                  layout="vertical"
                  data={top_materials.map((m) => ({ name: trunc(m.material_name, 28), qty: m.total_qty }))}
                  margin={{ top: 2, right: 40, left: 8, bottom: 0 }}
                >
                  {GRID}
                  <XAxis type="number" tick={X_TICK} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={180} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [v, "Total qty"]) as never} />
                  <Bar dataKey="qty" name="Qty ordered" fill={C.indigo} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2 text-right">Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_materials.map((m, i) => (
                      <tr key={i} className="border-b border-surface-border/50 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-200">{m.material_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-indigo-400">{m.total_qty}</td>
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
                  <Line type="monotone" dataKey="count" name="POs" stroke={C.blue} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [fmtL(v as number), "PO Value"]) as never} />
                  <Bar dataKey="value" name="PO Value" fill={C.blue} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {(() => {
                const totalPOs  = monthly_trend.reduce((s, m) => s + m.count, 0);
                const totalVal  = monthly_trend.reduce((s, m) => s + m.value, 0);
                const peakMonth = monthly_trend.reduce((best, m) =>
                  m.count > (best?.count ?? 0) ? m : best, monthly_trend[0]);
                return (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300">Pattern Insights</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {peakMonth && <li>Peak month: <span className="text-white">{peakMonth.month}</span> ({peakMonth.count} POs)</li>}
                      <li>Avg POs/month: <span className="text-blue-400">{(totalPOs / Math.max(monthly_trend.length, 1)).toFixed(1)}</span></li>
                      <li>Total value over period: <span className="text-blue-400">{fmtCr(totalVal)}</span></li>
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

export default function PoAnalyticsPage() {
  const [data, setData] = useState<PoData | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewPoId, setPreviewPoId] = useState<number | null>(null);
  const openPoPreview = useCallback((id: number) => setPreviewPoId(id), []);

  useEffect(() => {
    Promise.all([
      api<PoData>("/api/v1/analytics/po"),
      api<SupplierSummary[]>("/api/v1/analytics/po/suppliers"),
    ])
      .then(([po, sups]) => {
        setData(po);
        setSuppliers(sups);
        setLoading(false);
        if (sups.length > 0) setSelectedSupplier(sups[0].name);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedSupplier) return;
    setDetailLoading(true);
    setSupplierDetail(null);
    api<SupplierDetail>(`/api/v1/analytics/po/supplier?name=${encodeURIComponent(selectedSupplier)}`)
      .then((d) => { setSupplierDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedSupplier]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-6 text-sm text-red-400">
        Failed to load PO analytics: {error}
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const statusPie = data ? [
    { name: "Pending",     value: data.totals.pending,   fill: C.yellow  },
    { name: "Confirmed",   value: data.totals.confirmed, fill: C.blue    },
    { name: "Partial",     value: data.totals.partial,   fill: C.orange  },
    { name: "Delivered",   value: data.totals.delivered, fill: C.green   },
    { name: "Cancelled",   value: data.totals.cancelled, fill: C.slate   },
  ].filter((x) => x.value > 0) : [];

  const suppliersBarData = data
    ? [...data.top_suppliers].sort((a, b) => a.total_amount - b.total_amount).map((s) => ({
        name:  trunc(s.name, 22),
        value: s.total_amount,
      }))
    : [];

  return (
    <>
    {previewPoId !== null && <PoPreviewModal poId={previewPoId} onClose={() => setPreviewPoId(null)} />}
    <div className="space-y-6">

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
          <KpiCard label="Total POs"   value={data.totals.total.toLocaleString()} />
          <KpiCard label="Total Value" value={fmtCr(data.totals.total_value)}  color="text-blue-400" />
          <KpiCard label="Pending"     value={data.totals.pending.toLocaleString()} color="text-yellow-400" />
          <KpiCard label="Confirmed"   value={data.totals.confirmed.toLocaleString()} color="text-blue-400" />
          <KpiCard label="Delivered"   value={data.totals.delivered.toLocaleString()} color="text-green-400" />
          <KpiCard
            label="Overdue"
            value={data.totals.overdue.toLocaleString()}
            color={data.totals.overdue > 0 ? "text-red-400" : "text-green-400"}
            accent={data.totals.overdue > 0 ? "border-red-800/40" : undefined}
          />
        </div>
      ) : null}

      {/* ── Supplier Intelligence ── */}
      <Card title="Supplier Intelligence">
        {loading ? (
          <Sk className="h-96" />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            <div className="lg:border-r lg:border-surface-border lg:pr-4">
              <p className="mb-2 text-[11px] text-slate-500">
                {suppliers.length} suppliers — select to explore
              </p>
              <SupplierSelector
                suppliers={suppliers}
                selected={selectedSupplier}
                onSelect={setSelectedSupplier}
              />
            </div>
            <div className="min-w-0">
              {selectedSupplier === null && (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <p className="text-3xl">🏭</p>
                  <p className="mt-3 text-sm">Select a supplier to see their PO history, materials ordered, and delivery trends.</p>
                </div>
              )}
              {detailLoading && (
                <div className="space-y-3">
                  <Sk className="h-24" /><Sk className="h-10" /><Sk className="h-64" />
                </div>
              )}
              {supplierDetail && !detailLoading && (
                <SupplierDetailPanel detail={supplierDetail} onPoPreview={openPoPreview} />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Monthly PO Activity ── */}
      <LazySection skeleton={<Sk className="h-[320px] w-full" />}>
        {loading ? (
          <Sk className="h-[320px] w-full" />
        ) : data ? (
          <Card title="Monthly PO Activity — Count · Value">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="month" tick={X_TICK} />
                <YAxis yAxisId="left" tick={Y_TICK} />
                <YAxis yAxisId="right" orientation="right" tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                <Tooltip
                  {...TT_STYLE}
                  formatter={((v: unknown, name: unknown) =>
                    name === "PO Value" ? [fmtL(v as number), name] : [v, name]
                  ) as never}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar yAxisId="left"  dataKey="count" name="PO Count" fill={C.blue}  radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="value" name="PO Value" fill={C.teal}  radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : null}
      </LazySection>

      {/* ── Status Donut + Top Suppliers ── */}
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
            <Card title="PO Status Breakdown">
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
            </Card>

            <Card title="Top Suppliers by PO Value">
              {suppliersBarData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No supplier data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(suppliersBarData.length * 32, 200)}>
                  <BarChart layout="vertical" data={suppliersBarData}
                    margin={{ top: 2, right: 60, left: 8, bottom: 0 }}>
                    {GRID}
                    <XAxis type="number" tick={X_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={160} />
                    <Tooltip {...TT_STYLE} formatter={((v: unknown) => [fmtL(v as number), "Total PO Value"]) as never} />
                    <Bar dataKey="value" name="PO Value" fill={C.indigo} radius={[0, 3, 3, 0]} />
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
