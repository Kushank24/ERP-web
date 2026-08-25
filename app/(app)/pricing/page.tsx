"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  product_code: string | null;
  description: string | null;
  category: string | null;
  default_unit_price: number;
  boq_count: number;
};

type ListResponse = {
  items: Product[];
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

const fmtTime = (d: Date) =>
  d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-surface-border">
      {/* thead */}
      <div className="h-11 bg-surface-card" />
      {/* rows */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-t border-surface-border/50 px-4 py-4"
        >
          <div className="h-3.5 w-40 rounded bg-slate-700" />
          <div className="h-3.5 w-20 rounded bg-slate-800" />
          <div className="h-3.5 w-24 rounded bg-slate-800" />
          <div className="ml-auto h-8 w-32 rounded bg-slate-800" />
          <div className="h-3.5 w-20 rounded bg-slate-800" />
          <div className="h-8 w-16 rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({
  products,
  lastUpdated,
}: {
  products: Product[];
  lastUpdated: Date | null;
}) {
  const withBoq = products.filter((p) => p.boq_count > 0).length;
  const avgPrice =
    products.length > 0
      ? products.reduce((a, p) => a + p.default_unit_price, 0) / products.length
      : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total products */}
      <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Total Products
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">
          {products.length}
        </p>
        <p className="mt-1 text-xs text-slate-500">in catalogue</p>
      </div>

      {/* With BOQ */}
      <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          With BOQ Lines
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{withBoq}</p>
        <p className="mt-1 text-xs text-slate-500">have BOQ data</p>
      </div>

      {/* Avg price */}
      <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Avg. Unit Price
        </p>
        <p className="mt-2 text-xl font-semibold text-emerald-400 font-mono">
          {inr(avgPrice)}
        </p>
        <p className="mt-1 text-xs text-slate-500">across all products</p>
      </div>

      {/* Last updated */}
      <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Last Refreshed
        </p>
        {lastUpdated ? (
          <>
            <p className="mt-2 font-mono text-base font-semibold text-accent">
              {fmtTime(lastUpdated)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {lastUpdated.toLocaleDateString()}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">—</p>
        )}
      </div>
    </div>
  );
}

// ─── Price Row ────────────────────────────────────────────────────────────────

function PriceRow({
  product,
  draftPrice,
  isSaving,
  onChange,
  onSave,
}: {
  product: Product;
  draftPrice: string | undefined;
  isSaving: boolean;
  onChange(val: string): void;
  onSave(): void;
}) {
  const isDirty = draftPrice !== undefined;
  const displayVal = draftPrice ?? String(product.default_unit_price);
  const hasBoq = product.boq_count > 0;

  return (
    <tr
      className={`border-b border-surface-border/50 text-sm last:border-0 transition-colors ${
        isDirty ? "bg-accent/[0.04]" : "hover:bg-white/[0.02]"
      }`}
    >
      {/* Product name */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-white">{product.name}</span>
          {product.description && (
            <span className="max-w-[220px] truncate text-[11px] text-slate-500">
              {product.description}
            </span>
          )}
        </div>
      </td>

      {/* Code */}
      <td className="px-4 py-3">
        {product.product_code ? (
          <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
            {product.product_code}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>

      {/* Category */}
      <td className="px-4 py-3 text-slate-400">
        {product.category ?? <span className="text-slate-600">—</span>}
      </td>

      {/* Inline price input */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs text-slate-500">₹</span>
          <input
            type="number"
            step="any"
            min="0"
            value={displayVal}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Price for ${product.name}`}
            className={`w-32 rounded border bg-[#0f1419] px-2 py-1.5 text-sm text-white transition-colors focus:outline-none focus:ring-1 ${
              isDirty
                ? "border-accent/60 focus:ring-accent/30"
                : "border-surface-border focus:border-accent focus:ring-accent/20"
            }`}
          />
          {isDirty && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              title="Unsaved change"
            />
          )}
        </div>
      </td>

      {/* BOQ Lines */}
      <td className="px-4 py-3">
        {hasBoq ? (
          <span className="text-xs text-slate-300">
            {product.boq_count} line{product.boq_count !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Save action */}
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={!isDirty || isSaving}
          onClick={onSave}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            isDirty && !isSaving
              ? "bg-accent text-white hover:bg-accent/90"
              : "cursor-not-allowed bg-surface-border text-slate-600"
          } disabled:opacity-60`}
        >
          {isSaving ? (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-3 w-3 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Saving
            </span>
          ) : isDirty ? (
            "Save"
          ) : (
            "Saved"
          )}
        </button>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Per-row price drafts — undefined means untouched (pristine)
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  // Per-row saving state
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  // Per-row inline save errors
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const [search, setSearch] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all products across pages (pricing needs the full list)
      const PAGE_SIZE = 500;
      const first = await api<ListResponse>(`/api/v1/products?page=1&page_size=${PAGE_SIZE}`);
      let all: Product[] = first.items;
      if (first.total > PAGE_SIZE) {
        const remaining = Math.ceil((first.total - PAGE_SIZE) / PAGE_SIZE);
        const pages = await Promise.all(
          Array.from({ length: remaining }, (_, i) =>
            api<ListResponse>(`/api/v1/products?page=${i + 2}&page_size=${PAGE_SIZE}`)
          )
        );
        all = all.concat(pages.flatMap((p) => p.items));
      }
      setProducts(all);
      setDrafts({});
      setRowErrors({});
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Save single row ───────────────────────────────────────────────────────

  async function savePrice(id: number) {
    const raw = drafts[id];
    if (raw === undefined) return;

    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) {
      setRowErrors((p) => ({
        ...p,
        [id]: "Enter a valid non-negative number",
      }));
      return;
    }

    setSaving((p) => ({ ...p, [id]: true }));
    setRowErrors((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });

    try {
      await api(`/api/v1/products/${id}`, {
        method: "PATCH",
        json: { default_unit_price: parsed },
      });

      // Optimistic update — sync product list
      setProducts((p) =>
        p.map((pr) =>
          pr.id === id ? { ...pr, default_unit_price: parsed } : pr,
        ),
      );

      // Clear this row's draft
      setDrafts((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });

      setLastUpdated(new Date());
    } catch (e) {
      setRowErrors((p) => ({
        ...p,
        [id]: e instanceof Error ? e.message : "Save failed",
      }));
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const dirtyCount = Object.keys(drafts).length;

  const filtered =
    search.trim() === ""
      ? products
      : products.filter((p) => {
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            (p.product_code ?? "").toLowerCase().includes(q) ||
            (p.category ?? "").toLowerCase().includes(q)
          );
        });

  // ── Save all dirty rows ───────────────────────────────────────────────────

  async function saveAll() {
    const ids = Object.keys(drafts).map(Number);
    await Promise.allSettled(ids.map((id) => savePrice(id)));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Product Pricing</h1>
          <p className="mt-1 text-sm text-slate-400">
            View and update default unit prices per product. Changes are saved
            individually per row.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Save all dirty */}
          {dirtyCount > 0 && (
            <button
              type="button"
              onClick={saveAll}
              className="rounded-lg bg-emerald-700/80 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              💾 Save all ({dirtyCount})
            </button>
          )}

          {/* Refresh */}
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
      </div>

      {/* ── Summary cards ── */}
      {!loading && !error && (
        <SummaryCards products={products} lastUpdated={lastUpdated} />
      )}

      {/* ── Unsaved-changes banner ── */}
      {dirtyCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {dirtyCount} row{dirtyCount !== 1 ? "s" : ""} with unsaved price
            changes
          </div>
          <button
            type="button"
            onClick={() => {
              setDrafts({});
              setRowErrors({});
            }}
            className="text-xs text-slate-400 transition-colors hover:text-white"
          >
            Discard all
          </button>
        </div>
      )}

      {/* ── Global error ── */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-4">
          <span className="mt-0.5 text-red-400">⚠</span>
          <div>
            <p className="text-sm font-medium text-red-300">
              Failed to load products
            </p>
            <p className="mt-0.5 text-xs text-red-400/80">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 text-xs text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      {!loading && products.length > 0 && (
        <div className="relative max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, code or category…"
            className="w-full rounded-lg border border-surface-border bg-[#0f1419] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <TableSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border py-20 text-center">
          <p className="text-sm text-slate-400">
            No products found. Create products in the{" "}
            <a href="/products" className="text-accent hover:underline">
              Products &amp; BOQ
            </a>{" "}
            module.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border py-12 text-center">
          <p className="text-sm text-slate-400">
            No products match{" "}
            <span className="font-mono text-slate-300">
              &ldquo;{search}&rdquo;
            </span>
            .
          </p>
          <button
            type="button"
            onClick={() => setSearch("")}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left">
            <thead className="border-b border-surface-border bg-surface-card">
              <tr>
                {[
                  "Product",
                  "Code",
                  "Category",
                  "Default Unit Price (₹)",
                  "BOQ Total",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <>
                  <PriceRow
                    key={p.id}
                    product={p}
                    draftPrice={drafts[p.id]}
                    isSaving={saving[p.id] ?? false}
                    onChange={(val) =>
                      setDrafts((prev) => ({ ...prev, [p.id]: val }))
                    }
                    onSave={() => savePrice(p.id)}
                  />
                  {rowErrors[p.id] && (
                    <tr
                      key={`err-${p.id}`}
                      className="border-b border-surface-border/30"
                    >
                      <td
                        colSpan={6}
                        className="px-4 pb-2 pt-0 text-xs text-red-400"
                      >
                        ⚠ {rowErrors[p.id]}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer note ── */}
      {!loading && products.length > 0 && (
        <p className="text-[11px] text-slate-600">
          💡 Prices are saved per-row via PATCH /api/v1/products/:id. BOQ Total
          = Σ(section_size × quantity) across all lines — material-cost
          integration requires inventory pricing data.
        </p>
      )}
    </div>
  );
}
