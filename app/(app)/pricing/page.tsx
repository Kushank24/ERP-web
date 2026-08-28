"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type MaterialCost = {
  name: string;
  section_size: number;
  units: string;
  quantity: number;
  unit_cost: number;
  line_cost: number;
  has_cost: boolean;
};

type ProductCost = {
  id: number;
  name: string;
  product_code: string | null;
  category: string | null;
  boq_cost: number;
  boq_lines: number;
  has_missing_prices: boolean;
  material_costs: MaterialCost[];
};

type PageResult = {
  items: ProductCost[];
  total: number;
  page: number;
  page_size: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const PAGE_SIZE = 20;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-surface-border">
      <div className="h-11 bg-surface-card" />
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-surface-border/50 px-4 py-3.5">
          <div className="h-3 w-4 rounded bg-slate-800" />
          <div className="h-3.5 w-48 rounded bg-slate-700" />
          <div className="h-3.5 w-20 rounded bg-slate-800" />
          <div className="h-3.5 w-24 rounded bg-slate-800" />
          <div className="ml-auto h-3.5 w-28 rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

// ─── Material Breakdown Row ───────────────────────────────────────────────────

function BreakdownRow({ product }: { product: ProductCost }) {
  return (
    <tr className="border-b border-surface-border/30 bg-[#090d12]">
      <td colSpan={5} className="px-8 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Material Cost Breakdown — {product.boq_lines} line{product.boq_lines !== 1 ? "s" : ""}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-600">
              <th className="pb-1 text-left font-semibold">Material</th>
              <th className="pb-1 text-right font-semibold">Quantity</th>
              <th className="pb-1 text-right font-semibold">Unit Cost</th>
              <th className="pb-1 text-right font-semibold">Line Cost</th>
            </tr>
          </thead>
          <tbody>
            {product.material_costs.map((m, i) => (
              <tr key={i} className="border-t border-surface-border/20">
                <td className="py-1 text-slate-300">
                  {m.name}
                  {!m.has_cost && (
                    <span className="ml-1.5 text-[10px] text-amber-500/80">⚠ no price</span>
                  )}
                </td>
                <td className="py-1 text-right font-mono text-slate-400">
                  {m.section_size > 0
                    ? `${m.quantity} × ${m.section_size} ${m.units}`
                    : `${m.quantity} ${m.units}`}
                </td>
                <td className="py-1 text-right font-mono text-slate-400">
                  {m.has_cost ? inr(m.unit_cost) : "—"}
                </td>
                <td
                  className={`py-1 text-right font-mono font-semibold ${
                    m.has_cost ? "text-emerald-400" : "text-slate-600"
                  }`}
                >
                  {m.has_cost ? inr(m.line_cost) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-surface-border/50">
              <td colSpan={3} className="pt-1.5 text-right font-semibold text-slate-400">
                Total
              </td>
              <td className="pt-1.5 text-right font-mono font-bold text-emerald-400">
                {inr(product.boq_cost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </td>
    </tr>
  );
}

// ─── Pagination Controls ──────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange(p: number): void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pageNums: number[] = [];
  const add = (n: number) => !pageNums.includes(n) && pageNums.push(n);
  add(1);
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i);
  add(totalPages);
  pageNums.sort((a, b) => a - b);

  const withGaps: (number | "…")[] = [];
  pageNums.forEach((n, i) => {
    if (i > 0 && n - pageNums[i - 1] > 1) withGaps.push("…");
    withGaps.push(n);
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
      <span className="text-xs text-slate-500">
        {from}–{to} of {total} products
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded px-2 py-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          ‹
        </button>
        {withGaps.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-slate-600">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n as number)}
              className={`min-w-[2rem] rounded px-2 py-1 text-xs transition-colors ${
                n === page
                  ? "bg-accent text-white"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded px-2 py-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [items, setItems] = useState<ProductCost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search → reset to page 1 on change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      const data = await api<PageResult>(`/api/v1/products/costs?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setExpanded({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Product Pricing</h1>
          <p className="mt-1 text-sm text-slate-400">
            BOQ-computed material cost per product. Click a row to see the full material breakdown.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-card px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
          >
            <circle cx="6.5" cy="6.5" r="4" />
            <path d="M11 11l2.5 2.5" />
          </svg>
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code or category…"
          className="w-full rounded-lg border border-surface-border bg-[#0f1419] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-4">
          <span className="mt-0.5 text-red-400">⚠</span>
          <div>
            <p className="text-sm font-medium text-red-300">Failed to load products</p>
            <p className="mt-0.5 text-xs text-red-400/80">{error}</p>
            <button type="button" onClick={load} className="mt-2 text-xs text-accent hover:underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border py-16 text-center">
          <p className="text-sm text-slate-400">
            {debouncedSearch
              ? `No products match "${debouncedSearch}".`
              : "No products found. Create products in the Products & BOQ module."}
          </p>
          {debouncedSearch && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-2 text-xs text-accent hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left">
              <thead className="border-b border-surface-border bg-surface-card">
                <tr>
                  <th className="w-8" />
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Product
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Code
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    BOQ Material Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <>
                    <tr
                      key={p.id}
                      onClick={() => p.boq_lines > 0 && setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className={`border-b border-surface-border/50 text-sm transition-colors ${
                        p.boq_lines > 0 ? "cursor-pointer hover:bg-white/[0.025]" : ""
                      } ${expanded[p.id] ? "bg-white/[0.02]" : ""}`}
                    >
                      <td className="w-8 px-2 py-3 text-center text-[10px] text-slate-500">
                        {p.boq_lines > 0 ? (expanded[p.id] ? "▼" : "▶") : ""}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                      <td className="px-4 py-3">
                        {p.product_code ? (
                          <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
                            {p.product_code}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {p.category ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.boq_lines > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono font-semibold ${
                                p.has_missing_prices ? "text-amber-400" : "text-emerald-400"
                              }`}
                            >
                              {inr(p.boq_cost)}
                            </span>
                            {p.has_missing_prices && (
                              <span className="text-[10px] text-amber-500/70">⚠ missing prices</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">no BOQ</span>
                        )}
                      </td>
                    </tr>
                    {expanded[p.id] && p.boq_lines > 0 && (
                      <BreakdownRow key={`bd-${p.id}`} product={p} />
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={(p) => {
              setPage(p);
              setExpanded({});
            }}
          />
        </>
      )}
    </div>
  );
}
