"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Summary = {
  materials_count: number;
  products_count: number;
  purchase_orders_count: number;
  finished_goods_count: number;
  low_stock_materials_count: number;
  low_stock_finished_goods_count: number;
  total_inventory_value: number;
  total_po_value: number;
  total_fg_quantity: number;
  work_orders: { total: number; in_progress: number; completed: number };
  recent_purchase_orders: Array<{
    purchase_number: string;
    supplier_name: string | null;
    total_amount: number;
  }>;
  recent_finished_goods: Array<{
    product_name: string;
    party_name: string;
    quantity_in_stock: number;
  }>;
  low_stock_materials_sample: Array<{
    name: string;
    length_weight_nos: number;
    unit: string;
  }>;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

const DB_NOT_CONFIGURED = "DATABASE_URL" in String.prototype ? false : false; // placeholder — detection happens at runtime from the error text

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
                  Scroll to{" "}
                  <span className="font-mono text-amber-300">
                    Connection string
                  </span>{" "}
                  and select{" "}
                  <span className="font-mono text-amber-300">
                    Session pooler
                  </span>{" "}
                  (port 5432) or{" "}
                  <span className="font-mono text-amber-300">
                    Transaction pooler
                  </span>{" "}
                  (port 6543)
                </li>
                <li>
                  Copy the URI, replace{" "}
                  <span className="font-mono text-amber-300">
                    [YOUR-PASSWORD]
                  </span>
                  , change the scheme to{" "}
                  <span className="font-mono text-amber-300">
                    postgresql+psycopg://
                  </span>
                </li>
                <li>
                  Set it as{" "}
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
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Overview aligned with the legacy Streamlit home view.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Raw materials" value={data.materials_count} />
        <Metric label="Products" value={data.products_count} />
        <Metric label="Purchase orders" value={data.purchase_orders_count} />
        <Metric label="Finished goods" value={data.finished_goods_count} />
        <Metric
          label="Low stock (materials)"
          value={data.low_stock_materials_count}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">System overview</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>Total inventory value: ₹{fmt(data.total_inventory_value)}</li>
            <li>Total PO value: ₹{fmt(data.total_po_value)}</li>
            <li>Finished goods quantity: {fmt(data.total_fg_quantity)}</li>
            <li>
              Work orders: {data.work_orders.total} total —{" "}
              {data.work_orders.in_progress} in progress,{" "}
              {data.work_orders.completed} completed
            </li>
          </ul>
          {data.recent_purchase_orders.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs uppercase text-slate-500">
                Recent purchase orders
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-400">
                {data.recent_purchase_orders.map((po) => (
                  <li key={po.purchase_number}>
                    {po.purchase_number} — {po.supplier_name ?? "—"} — ₹
                    {fmt(po.total_amount)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <h2 className="text-sm font-medium text-white">Alerts</h2>
          {data.low_stock_materials_count > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-100">
              {data.low_stock_materials_count} material(s) below threshold.
              <ul className="mt-2 list-inside list-disc text-amber-200/90">
                {data.low_stock_materials_sample.map((m) => (
                  <li key={m.name}>
                    {m.name}: {m.length_weight_nos} {m.unit}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-emerald-400/90">
              All raw materials above low-stock threshold.
            </p>
          )}
          {data.low_stock_finished_goods_count > 0 && (
            <p className="mt-4 text-sm text-amber-200">
              Finished goods low stock: {data.low_stock_finished_goods_count}{" "}
              SKU(s).
            </p>
          )}
          {data.recent_finished_goods.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs uppercase text-slate-500">
                Recent finished goods
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-400">
                {data.recent_finished_goods.map((fg) => (
                  <li key={`${fg.product_name}-${fg.party_name}`}>
                    {fg.product_name} — {fg.party_name} ({fg.quantity_in_stock}{" "}
                    units)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
