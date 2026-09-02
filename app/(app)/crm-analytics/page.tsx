"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
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

type CrmData = {
  totals: {
    enquiries: number; offers: number; accepted: number;
    rejected: number; open: number; draft: number; companies: number;
  };
  pipeline: {
    open_value: number; won_value: number;
    avg_offer_value: number; win_rate_pct: number;
  };
  monthly: Array<{ month: string; enquiries: number; offers: number; won: number; won_value: number }>;
};

type CompanySummary = {
  id: number; name: string;
  enquiry_count: number; offer_count: number; last_activity: string | null;
};

type CompanyDetail = {
  company: { id: number; name: string; contact_person: string; phone: string; email: string; gstin: string };
  summary: {
    total_enquiries: number; total_offers: number; accepted_offers: number;
    win_rate_pct: number; total_won_value: number;
  };
  enquiries: Array<{
    id: number; enquiry_number: string; enquiry_date: string | null;
    status: string; priority: string; reference_number: string;
  }>;
  offers: Array<{
    id: number; offer_number: string; offer_date: string | null; status: string;
    total_amount: number; follow_up: string; enquiry_id: number | null;
    products: Array<{ product: string; quantity: number; unit_price: number; total: number }>;
  }>;
  top_products: Array<{ product: string; quantity: number }>;
  monthly_trend: Array<{ month: string; enquiries: number; offers: number; won: number; won_value: number }>;
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

function trunc(s: string, max = 25): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

// ── Shared ────────────────────────────────────────────────────────────────────

const GRID = <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />;
const X_TICK = { fill: "#64748b", fontSize: 10 };
const Y_TICK = { fill: "#64748b", fontSize: 10 };
const TT_STYLE = {
  contentStyle: { background: "#0f1419", border: "1px solid #1e2530", borderRadius: 8, fontSize: 12 },
};

const C = {
  blue: "#3b82f6", green: "#22c55e", red: "#ef4444",
  slate: "#64748b", orange: "#f97316", indigo: "#6366f1", teal: "#14b8a6",
};

const STATUS_COLORS: Record<string, string> = {
  accepted: "bg-green-500/15 text-green-400 border-green-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  sent:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  draft:    "bg-slate-500/15 text-slate-400 border-slate-500/30",
  expired:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "text-red-400",
  medium: "text-orange-400",
  low:    "text-slate-400",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.04] ${className}`} />;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "text-white",
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-5">
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

// ── Status badge ──────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// ── Record Preview Modal ──────────────────────────────────────────────────────

type PreviewRecord = { type: "offer" | "enquiry"; id: number };

function RecordPreviewModal({
  record,
  onClose,
}: {
  record: PreviewRecord;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null); setData(null);
    const url = record.type === "offer"
      ? `/api/v1/offers/${record.id}`
      : `/api/v1/enquiries/${record.id}`;
    api(url)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [record]);

  // close on backdrop click or Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const fullHref = record.type === "offer"
    ? `/offers?id=${record.id}`
    : `/enquiries?id=${record.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-surface-border bg-[#0f1419] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {record.type === "offer" ? "Offer Preview" : "Enquiry Preview"}
          </p>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              <Sk className="h-5 w-40" /><Sk className="h-4 w-32" /><Sk className="h-24" />
            </div>
          )}
          {err && <p className="text-sm text-red-400">Failed to load: {err}</p>}
          {data && record.type === "offer" && <OfferPreviewBody data={data} />}
          {data && record.type === "enquiry" && <EnquiryPreviewBody data={data} />}
        </div>

        {/* Footer */}
        <div className="border-t border-surface-border px-5 py-3">
          <Link
            href={fullHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            Open in {record.type === "offer" ? "Offers" : "Enquiries"} page →
          </Link>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OfferPreviewBody({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-white">{data.offer_number}</p>
          <p className="text-xs text-slate-500">{fmtDate(data.offer_date)} · {data.company_name ?? "—"}</p>
        </div>
        <Badge status={data.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Total</p>
          <p className="mt-1 text-sm font-bold text-blue-400">{fmtCr(data.total_amount ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Valid Until</p>
          <p className="mt-1 text-sm font-medium text-white">{fmtDate(data.valid_until)}</p>
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
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: { product_name_resolved?: string; description: string; quantity: number; unit_price: number }, i: number) => (
                  <tr key={i} className="border-b border-surface-border/50">
                    <td className="px-3 py-1.5 text-slate-200">{it.product_name_resolved || it.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{it.quantity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">₹{it.unit_price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.follow_up_comments && (
        <p className="text-[11px] italic text-slate-500">"{data.follow_up_comments}"</p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EnquiryPreviewBody({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-white">{data.enquiry_number}</p>
          <p className="text-xs text-slate-500">{fmtDate(data.enquiry_date)} · {data.company_name ?? "—"}</p>
        </div>
        <Badge status={data.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Priority</p>
          <p className={`mt-1 text-sm font-bold ${PRIORITY_COLORS[data.priority] || "text-white"}`}>
            {data.priority || "—"}
          </p>
        </div>
        {data.reference_number && (
          <div className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-slate-600">Reference</p>
            <p className="mt-1 text-sm font-medium text-white">{data.reference_number}</p>
          </div>
        )}
      </div>

      {data.items?.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Items Enquired</p>
          <div className="overflow-hidden rounded-lg border border-surface-border">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-surface-border bg-[#0b0f14] text-left text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: { product_name?: string; quantity: number }, i: number) => (
                  <tr key={i} className="border-b border-surface-border/50">
                    <td className="px-3 py-1.5 text-slate-200">{it.product_name || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{it.quantity}</td>
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
  );
}

// ── Company Selector ──────────────────────────────────────────────────────────

function CompanySelector({
  companies, selected, onSelect,
}: {
  companies: CompanySummary[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search company…"
        className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
      />
      <div className="max-h-[420px] overflow-y-auto space-y-px pr-0.5">
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-500">No companies found</p>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
              selected === c.id
                ? "bg-blue-600/20 text-white"
                : "text-slate-300 hover:bg-white/[0.04]"
            }`}
          >
            <p className="text-[13px] font-medium leading-tight truncate">{c.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {c.enquiry_count} enq · {c.offer_count} offers
              {c.last_activity && ` · ${fmtDate(c.last_activity)}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Company Detail Panel ──────────────────────────────────────────────────────

function CompanyDetailPanel({ detail, onPreview }: { detail: CompanyDetail; onPreview: (type: "offer" | "enquiry", id: number) => void }) {
  const { company, summary, enquiries, offers, top_products, monthly_trend } = detail;
  const [activeTab, setActiveTab] = useState<"timeline" | "products" | "trend">("timeline");

  // Build merged timeline
  const timeline = [
    ...enquiries.map((e) => ({ type: "enquiry" as const, date: e.enquiry_date, data: e })),
    ...offers.map((o) => ({ type: "offer" as const, date: o.offer_date, data: o })),
  ].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Company header */}
      <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 p-4">
        <h2 className="text-base font-bold text-white">{company.name}</h2>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400">
          {company.contact_person && <span>👤 {company.contact_person}</span>}
          {company.phone         && <span>📞 {company.phone}</span>}
          {company.email         && <span>✉ {company.email}</span>}
          {company.gstin         && <span className="font-mono text-slate-500">GSTIN: {company.gstin}</span>}
        </div>
        {/* Summary KPIs */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Enquiries",     value: summary.total_enquiries,              color: "" },
            { label: "Offers",        value: summary.total_offers,                 color: "" },
            { label: "Accepted",      value: summary.accepted_offers,              color: "text-green-400" },
            { label: "Win Rate",      value: `${summary.win_rate_pct}%`,           color: "text-green-400" },
            { label: "Won Revenue",   value: fmtCr(summary.total_won_value),       color: "text-blue-400" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">{k.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${k.color || "text-white"}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-surface-border bg-[#0b0f14] p-1">
        {(["timeline", "products", "trend"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-blue-600/25 text-blue-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "timeline" ? "Interaction History" : tab === "products" ? "Products Enquired" : "Monthly Trend"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "timeline" && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 520 }}>
          {timeline.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">No interactions yet</p>
          )}
          {timeline.map((item, i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-surface-border bg-[#0b0f14] p-3">
              {/* Type pill */}
              <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  item.type === "enquiry"
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}>
                  {item.type === "enquiry" ? "E" : "O"}
                </span>
                {i < timeline.length - 1 && (
                  <div className="w-px flex-1 bg-surface-border" style={{ minHeight: 12 }} />
                )}
              </div>
              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {item.type === "enquiry" ? (
                      <button
                        onClick={() => onPreview("enquiry", (item.data as typeof enquiries[0]).id)}
                        className="text-[12px] font-semibold text-white hover:text-blue-400 hover:underline text-left"
                      >
                        {(item.data as typeof enquiries[0]).enquiry_number}
                      </button>
                    ) : (
                      <button
                        onClick={() => onPreview("offer", (item.data as typeof offers[0]).id)}
                        className="text-[12px] font-semibold text-white hover:text-blue-400 hover:underline text-left"
                      >
                        {(item.data as typeof offers[0]).offer_number}
                      </button>
                    )}
                    <p className="text-[10px] text-slate-500">{fmtDate(item.date)}</p>
                  </div>
                  <Badge status={
                    item.type === "enquiry"
                      ? (item.data as typeof enquiries[0]).status
                      : (item.data as typeof offers[0]).status
                  } />
                </div>

                {item.type === "enquiry" && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                    {(item.data as typeof enquiries[0]).priority && (
                      <span className={PRIORITY_COLORS[(item.data as typeof enquiries[0]).priority] || "text-slate-400"}>
                        ● {(item.data as typeof enquiries[0]).priority} priority
                      </span>
                    )}
                    {(item.data as typeof enquiries[0]).reference_number && (
                      <span className="text-slate-500">Ref: {(item.data as typeof enquiries[0]).reference_number}</span>
                    )}
                  </div>
                )}

                {item.type === "offer" && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[11px] font-semibold text-blue-400">
                      {fmtCr((item.data as typeof offers[0]).total_amount)}
                    </p>
                    {(item.data as typeof offers[0]).products.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(item.data as typeof offers[0]).products.slice(0, 4).map((p, j) => (
                          <span key={j} className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {trunc(p.product, 20)} × {p.quantity}
                          </span>
                        ))}
                        {(item.data as typeof offers[0]).products.length > 4 && (
                          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                            +{(item.data as typeof offers[0]).products.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                    {(item.data as typeof offers[0]).follow_up && (
                      <p className="text-[10px] italic text-slate-500">
                        "{(item.data as typeof offers[0]).follow_up}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "products" && (
        <div className="space-y-3">
          {top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No product data</p>
          ) : (
            <>
              {/* Bar chart */}
              <ResponsiveContainer width="100%" height={Math.max(top_products.length * 32, 160)}>
                <BarChart
                  layout="vertical"
                  data={top_products.map((p) => ({ name: trunc(p.product, 28), qty: p.quantity }))}
                  margin={{ top: 2, right: 40, left: 8, bottom: 0 }}
                >
                  {GRID}
                  <XAxis type="number" tick={X_TICK} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={180} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [v, "Units enquired"]) as never} />
                  <Bar dataKey="qty" name="Qty enquired" fill={C.indigo} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {/* Table */}
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
                        <td className="px-3 py-2 text-right tabular-nums text-indigo-400">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
                  <Line type="monotone" dataKey="enquiries" name="Enquiries" stroke={C.slate} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="offers"    name="Offers"    stroke={C.blue}  strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="won"       name="Won"       stroke={C.green} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              {/* Won revenue */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [fmtL(v as number), "Won Revenue"]) as never} />
                  <Bar dataKey="won_value" name="Won Revenue" fill={C.green} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Pattern insight */}
              {(() => {
                const totalWon = monthly_trend.reduce((s, m) => s + m.won, 0);
                const totalOffers = monthly_trend.reduce((s, m) => s + m.offers, 0);
                const convRate = totalOffers > 0 ? Math.round((totalWon / totalOffers) * 100) : 0;
                const peakMonth = monthly_trend.reduce((best, m) =>
                  m.enquiries > (best?.enquiries ?? 0) ? m : best, monthly_trend[0]);
                return (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300">Pattern Insights</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {peakMonth && <li>Peak enquiry month: <span className="text-white">{peakMonth.month}</span> ({peakMonth.enquiries} enquiries)</li>}
                      <li>Overall conversion: <span className={convRate >= 50 ? "text-green-400" : "text-orange-400"}>{convRate}%</span> of offers accepted</li>
                      <li>Total pipeline from this company: <span className="text-blue-400">{fmtCr(monthly_trend.reduce((s, m) => s + m.won_value, 0))}</span> won revenue</li>
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
              ? "border-blue-500 bg-blue-500/20 text-blue-400"
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

export default function CrmAnalyticsPage() {
  const [data, setData] = useState<CrmData | null>(null);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewRecord | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const openPreview = useCallback((type: PreviewRecord["type"], id: number) => setPreview({ type, id }), []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString() ? `?${params}` : "";

    setLoading(true);
    setError(null);
    Promise.all([
      api<CrmData>(`/api/v1/analytics/crm${qs}`),
      api<CompanySummary[]>(`/api/v1/analytics/companies${qs}`),
    ])
      .then(([crm, cos]) => {
        setData(crm);
        setCompanies(cos);
        setLoading(false);
        // Auto-select first company so the panel isn't blank on load
        if (cos.length > 0) setSelectedCompanyId(cos[0].id);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompanyId === null) return;
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString() ? `?${params}` : "";

    setDetailLoading(true);
    setCompanyDetail(null);
    api<CompanyDetail>(`/api/v1/analytics/company/${selectedCompanyId}${qs}`)
      .then((d) => { setCompanyDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedCompanyId, dateFrom, dateTo]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-6 text-sm text-red-400">
        Failed to load CRM analytics: {error}
      </div>
    );
  }

  const statusPie = data ? [
    { name: "Sent",     value: data.totals.open,     fill: C.blue   },
    { name: "Accepted", value: data.totals.accepted,  fill: C.green  },
    { name: "Rejected", value: data.totals.rejected,  fill: C.red    },
    { name: "Draft",    value: data.totals.draft,     fill: C.slate  },
  ] : [];

  return (
    <>
    {preview && <RecordPreviewModal record={preview} onClose={() => setPreview(null)} />}
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
          <KpiCard label="Total Enquiries" value={data.totals.enquiries.toLocaleString()} />
          <KpiCard label="Total Offers"    value={data.totals.offers.toLocaleString()} />
          <KpiCard label="Win Rate"        value={`${data.pipeline.win_rate_pct}%`}    color="text-green-400" />
          <KpiCard label="Open Pipeline"   value={fmtCr(data.pipeline.open_value)}     color="text-blue-400" />
          <KpiCard label="Won Revenue"     value={fmtCr(data.pipeline.won_value)}      color="text-green-400" />
          <KpiCard label="Avg Deal Size"   value={fmtL(data.pipeline.avg_offer_value)} />
        </div>
      ) : null}

      {/* ── Company Deep-Dive ── */}
      <Card title="Company Intelligence">
        {loading ? (
          <Sk className="h-96" />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            {/* Selector */}
            <div className="lg:border-r lg:border-surface-border lg:pr-4">
              <p className="mb-2 text-[11px] text-slate-500">
                {companies.length} companies — select to explore
              </p>
              <CompanySelector
                companies={companies}
                selected={selectedCompanyId}
                onSelect={setSelectedCompanyId}
              />
            </div>

            {/* Detail */}
            <div className="min-w-0">
              {selectedCompanyId === null && (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <p className="text-3xl">🏢</p>
                  <p className="mt-3 text-sm">Select a company to see their full interaction history, products enquired, and trends.</p>
                </div>
              )}
              {detailLoading && (
                <div className="space-y-3">
                  <Sk className="h-28" />
                  <Sk className="h-10" />
                  <Sk className="h-64" />
                </div>
              )}
              {companyDetail && !detailLoading && (
                <CompanyDetailPanel detail={companyDetail} onPreview={openPreview} />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Monthly Activity ── */}
      <LazySection skeleton={<Sk className="h-[320px] w-full" />}>
        {loading ? (
          <Sk className="h-[320px] w-full" />
        ) : data ? (
          <Card title="Monthly Activity — Enquiries · Offers · Won">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="month" tick={X_TICK} />
                <YAxis tick={Y_TICK} />
                <Tooltip {...TT_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Line type="monotone" dataKey="enquiries" name="Enquiries"    stroke={C.slate} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="offers"    name="Offers Sent"  stroke={C.blue}  strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="won"       name="Won"          stroke={C.green} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        ) : null}
      </LazySection>

      {/* ── Offer Status Donut + Monthly Won Revenue ── */}
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
            <Card title="Offer Status Breakdown">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {statusPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip {...TT_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {statusPie.map((e) => (
                  <div key={e.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: e.fill }} />
                    {e.name} <span className="text-slate-500">({e.value})</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Monthly Won Revenue">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  {GRID}
                  <XAxis dataKey="month" tick={X_TICK} />
                  <YAxis tick={Y_TICK} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                  <Tooltip {...TT_STYLE} formatter={((v: unknown) => [fmtL(v as number), "Won Revenue"]) as never} />
                  <Bar dataKey="won_value" name="Won Revenue" fill={C.green} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        ) : null}
      </LazySection>

    </div>
    </>
  );
}
