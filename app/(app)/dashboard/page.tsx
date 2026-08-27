"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Summary = {
  companies_count: number;
  enquiries_count: number;
  open_enquiries_count: number;
  offers_count: number;
  active_offers_count: number;
  materials_count: number;
  finished_goods_count: number;
  low_stock_materials_count: number;
  low_stock_finished_goods_count: number;
  total_inventory_value: number;
  total_fg_quantity: number;
  work_orders: { total: number; in_progress: number; completed: number };
  enquiry_by_status: Record<string, number>;
  offer_by_status: Record<string, number>;
  recent_enquiries: Array<{
    enquiry_number: string;
    company_name: string | null;
    status: string;
    priority: string;
    enquiry_date: string;
  }>;
  recent_offers: Array<{
    offer_number: string;
    company_name: string | null;
    status: string;
    total_amount: number;
    offer_date: string;
  }>;
  low_stock_materials_sample: Array<{
    name: string;
    length_weight_nos: number;
    unit: string;
  }>;
};

function isDbError(msg: string): boolean {
  return (
    msg.toLowerCase().includes("database") ||
    msg.toLowerCase().includes("pooler") ||
    msg.toLowerCase().includes("supabase") ||
    msg.toLowerCase().includes("dns") ||
    msg.toLowerCase().includes("cannot connect") ||
    msg.toLowerCase().includes("503")
  );
}

function Metric({
  label,
  value,
  sub,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const ENQUIRY_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  offer_sent: "Offer Sent",
  completed: "Completed",
  cancelled: "Cancelled",
};

const OFFER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

const ENQUIRY_STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-300",
  in_progress: "text-blue-300",
  offer_sent: "text-violet-300",
  completed: "text-emerald-400",
  cancelled: "text-slate-500",
};

const OFFER_STATUS_COLOR: Record<string, string> = {
  draft: "text-slate-400",
  sent: "text-blue-300",
  accepted: "text-emerald-400",
  rejected: "text-red-400",
  expired: "text-slate-500",
};

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isDbErr, setIsDbErr] = useState(false);

  useEffect(() => {
    api<Summary>("/api/v1/dashboard/summary")
      .then(setData)
      .catch((e: Error) => {
        setErr(e.message);
        setIsDbErr(isDbError(e.message));
      });
  }, []);

  if (err) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        {isDbErr ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6">
            <h2 className="text-base font-semibold text-amber-300">
              ⚠ Database not connected
            </h2>
            <p className="mt-2 text-sm text-amber-200/80">{err}</p>
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-black/30 p-4 text-xs text-amber-100/70 space-y-2">
              <p className="font-semibold text-amber-200">How to fix:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Open{" "}
                  <span className="font-mono text-amber-300">
                    Supabase Dashboard → Project Settings → Database
                  </span>
                </li>
                <li>
                  Copy the connection string, choose{" "}
                  <span className="font-mono text-amber-300">
                    Session pooler
                  </span>{" "}
                  (port 5432)
                </li>
                <li>
                  Change scheme to{" "}
                  <span className="font-mono text-amber-300">
                    postgresql+psycopg://
                  </span>{" "}
                  and set as{" "}
                  <span className="font-mono text-amber-300">DATABASE_URL</span>{" "}
                  in{" "}
                  <span className="font-mono text-amber-300">
                    ERP/backend/.env
                  </span>
                </li>
                <li>Restart uvicorn</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-red-200">
            <p className="text-sm">{err}</p>
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return <p className="text-slate-400">Loading dashboard…</p>;
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">{today}</p>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Companies"
          value={data.companies_count}
          sub="registered clients"
        />
        <Metric
          label="Enquiries"
          value={data.enquiries_count}
          sub={`${data.open_enquiries_count} open`}
          color={data.open_enquiries_count > 0 ? "text-amber-300" : "text-white"}
        />
        <Metric
          label="Offers"
          value={data.offers_count}
          sub={`${data.active_offers_count} active`}
          color={data.active_offers_count > 0 ? "text-blue-300" : "text-white"}
        />
        <Metric
          label="Work orders"
          value={data.work_orders.total}
          sub={`${data.work_orders.in_progress} in progress`}
          color={data.work_orders.in_progress > 0 ? "text-violet-300" : "text-white"}
        />
      </div>

      {/* Status breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Enquiry pipeline */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">Enquiry pipeline</h2>
          <div className="mt-4 space-y-2">
            {Object.entries(ENQUIRY_STATUS_LABEL).map(([key, label]) => {
              const count = data.enquiry_by_status[key] ?? 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className={ENQUIRY_STATUS_COLOR[key] ?? "text-slate-400"}>
                    {label}
                  </span>
                  <span className="font-semibold text-white">{count}</span>
                </div>
              );
            })}
            {Object.values(data.enquiry_by_status).every((v) => v === 0) && (
              <p className="text-sm text-slate-500">No enquiries yet.</p>
            )}
          </div>

          {data.recent_enquiries.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs uppercase tracking-wide text-slate-500">
                Recent enquiries
              </h3>
              <ul className="mt-2 divide-y divide-surface-border">
                {data.recent_enquiries.map((e) => (
                  <li
                    key={e.enquiry_number}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium text-slate-200">
                        {e.enquiry_number}
                      </span>
                      {e.company_name && (
                        <span className="ml-2 text-slate-500">
                          {e.company_name}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs ${ENQUIRY_STATUS_COLOR[e.status] ?? "text-slate-400"}`}
                    >
                      {ENQUIRY_STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Offers pipeline */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">Offers pipeline</h2>
          <div className="mt-4 space-y-2">
            {Object.entries(OFFER_STATUS_LABEL).map(([key, label]) => {
              const count = data.offer_by_status[key] ?? 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className={OFFER_STATUS_COLOR[key] ?? "text-slate-400"}>
                    {label}
                  </span>
                  <span className="font-semibold text-white">{count}</span>
                </div>
              );
            })}
            {Object.values(data.offer_by_status).every((v) => v === 0) && (
              <p className="text-sm text-slate-500">No offers yet.</p>
            )}
          </div>

          {data.recent_offers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs uppercase tracking-wide text-slate-500">
                Recent offers
              </h3>
              <ul className="mt-2 divide-y divide-surface-border">
                {data.recent_offers.map((o) => (
                  <li
                    key={o.offer_number}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium text-slate-200">
                        {o.offer_number}
                      </span>
                      {o.company_name && (
                        <span className="ml-2 text-slate-500">
                          {o.company_name}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className={`block text-xs ${OFFER_STATUS_COLOR[o.status] ?? "text-slate-400"}`}
                      >
                        {OFFER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        ₹{fmt(o.total_amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Inventory & alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">Inventory snapshot</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li className="flex justify-between">
              <span className="text-slate-400">Raw materials</span>
              <span>{data.materials_count} items</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Finished goods</span>
              <span>{data.finished_goods_count} SKUs</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">FG quantity in stock</span>
              <span>{fmt(data.total_fg_quantity)} units</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Work orders completed</span>
              <span>{data.work_orders.completed}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">Alerts</h2>
          {data.low_stock_materials_count === 0 &&
          data.low_stock_finished_goods_count === 0 ? (
            <p className="mt-4 text-sm text-emerald-400/90">
              No stock alerts — all levels above threshold.
            </p>
          ) : null}

          {data.low_stock_materials_count > 0 && (
            <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-100">
              <p className="font-medium">
                {data.low_stock_materials_count} material
                {data.low_stock_materials_count !== 1 ? "s" : ""} below threshold
              </p>
              <ul className="mt-2 list-inside list-disc text-amber-200/90">
                {data.low_stock_materials_sample.map((m) => (
                  <li key={m.name}>
                    {m.name}: {m.length_weight_nos} {m.unit}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.low_stock_finished_goods_count > 0 && (
            <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-200">
              {data.low_stock_finished_goods_count} finished goods SKU
              {data.low_stock_finished_goods_count !== 1 ? "s" : ""} running low.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
