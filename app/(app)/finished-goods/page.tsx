"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FGRow = {
  id: number;
  product_name: string;
  product_code: string | null;
  product_category: string | null;
  quantity_in_stock: number;
  work_order_number: string | null;
  party_name: string | null;
  completion_date: string | null;
  production_cost: number | null;
  notes: string | null;
};

type WOOption = {
  id: number;
  work_order_number: string;
  party_name: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-border/40 ${className}`}
    />
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-400"
    >
      <span className="mt-px shrink-0 leading-none">⚠</span>
      <span className="leading-snug">{message}</span>
    </div>
  );
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3.5 py-3 text-sm text-green-400"
    >
      <span className="mt-px shrink-0 leading-none">✓</span>
      <span className="leading-snug">{message}</span>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20 ${className}`}
    />
  );
}

function Select({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20 ${className}`}
    />
  );
}

function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20 ${className}`}
    />
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-[#0f1419] text-slate-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 truncate text-xl font-bold text-white">{value}</p>
        {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-stock threshold
// ─────────────────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function FinishedGoodsPage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FGRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");

  // ── Return to inventory modal ───────────────────────────────────────────────
  const [returnTarget, setReturnTarget] = useState<FGRow | null>(null);
  const [rvQty, setRvQty] = useState("");
  const [rvMatName, setRvMatName] = useState("");
  const [rvUnit, setRvUnit] = useState("Nos");
  const [rvCost, setRvCost] = useState("0");
  const [rvNotes, setRvNotes] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [rvFoundPrice, setRvFoundPrice] = useState<number | null>(null);

  // When material name changes, look up its price in inventory
  useEffect(() => {
    if (!rvMatName.trim()) { setRvFoundPrice(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ items: { name: string; per_unit_cost: number; unit: string }[] }>(
          `/api/v1/materials?q=${encodeURIComponent(rvMatName.trim())}&limit=20`
        );
        if (cancelled) return;
        const match = res.items.find(
          (m) => m.name.toLowerCase().trim() === rvMatName.toLowerCase().trim()
        );
        if (match) {
          setRvFoundPrice(match.per_unit_cost);
          setRvCost(String(match.per_unit_cost));
          if (match.unit) setRvUnit(match.unit);
        } else {
          setRvFoundPrice(null);
        }
      } catch { if (!cancelled) setRvFoundPrice(null); }
    })();
    return () => { cancelled = true; };
  }, [rvMatName]);

  function openReturn(row: FGRow) {
    setReturnTarget(row);
    setRvQty("");
    setRvMatName(row.product_name);
    setRvUnit("Nos");
    setRvCost("0");
    setRvFoundPrice(null);
    setRvNotes("");
    setReturnError(null);
  }
  function closeReturn() { setReturnTarget(null); setRvMatName(""); setRvFoundPrice(null); }

  async function handleReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnTarget) return;
    setReturning(true);
    setReturnError(null);
    try {
      await api(`/api/v1/finished-goods/${returnTarget.id}/return-to-inventory`, {
        method: "POST",
        json: {
          quantity: parseFloat(rvQty),
          material_name: rvMatName.trim() || null,
          unit: rvUnit.trim() || "Nos",
          per_unit_cost: parseFloat(rvCost) || 0,
          notes: rvNotes.trim() || null,
        },
      });
      loadData();
      closeReturn();
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : "Failed to return to inventory.");
    } finally {
      setReturning(false);
    }
  }

  // ── Work order options ──────────────────────────────────────────────────────
  const [woOptions, setWoOptions] = useState<WOOption[]>([]);

  // ── Form visibility ─────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [fProductName, setFProductName] = useState("");
  const [fProductCode, setFProductCode] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fQty, setFQty] = useState("");
  const [fSelectedWOId, setFSelectedWOId] = useState("");
  const [fWONumber, setFWONumber] = useState("");
  const [fPartyName, setFPartyName] = useState("");
  const [fCompletionDate, setFCompletionDate] = useState("");
  const [fProductionCost, setFProductionCost] = useState("");
  const [fNotes, setFNotes] = useState("");

  // ── Load finished goods ─────────────────────────────────────────────────────
  const loadData = useCallback((q = searchText) => {
    setLoading(true);
    setLoadError(null);
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    api<FGRow[]>(`/api/v1/finished-goods${qs}`)
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? "Failed to load finished goods");
        setLoading(false);
      });
  }, []);

  // ── Load work order options ─────────────────────────────────────────────────
  const loadWOs = useCallback(() => {
    api<{ data: WOOption[] }>("/api/v1/work-orders")
      .then((res) => setWoOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(""); loadWOs(); }, [loadData, loadWOs]);

  // Debounce search → refetch
  const fgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fgDebounceRef.current) clearTimeout(fgDebounceRef.current);
    fgDebounceRef.current = setTimeout(() => {
      setSearchText(searchInput);
      loadData(searchInput);
    }, 350);
    return () => { if (fgDebounceRef.current) clearTimeout(fgDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── When WO selected, auto-fill WO number and party name ───────────────────
  function handleWOSelect(woId: string) {
    setFSelectedWOId(woId);
    if (!woId) return;
    const found = woOptions.find((w) => String(w.id) === woId);
    if (found) {
      setFWONumber(found.work_order_number);
      if (found.party_name && !fPartyName) {
        setFPartyName(found.party_name);
      }
    }
  }

  // ── Reset form ──────────────────────────────────────────────────────────────
  function resetForm() {
    setFProductName("");
    setFProductCode("");
    setFCategory("");
    setFQty("");
    setFSelectedWOId("");
    setFWONumber("");
    setFPartyName("");
    setFCompletionDate("");
    setFProductionCost("");
    setFNotes("");
    setSaveError(null);
    setSaveSuccess(null);
  }

  function toggleForm() {
    setFormOpen((prev) => {
      if (!prev) {
        // opening — clear messages
        setSaveError(null);
        setSaveSuccess(null);
      }
      return !prev;
    });
  }

  // ── Save new finished good ──────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        product_name: fProductName.trim(),
        product_code: fProductCode.trim() || null,
        product_category: fCategory.trim() || null,
        quantity_in_stock: parseInt(fQty, 10) || 0,
        work_order_number: fWONumber.trim() || null,
        party_name: fPartyName.trim() || null,
        completion_date: fCompletionDate || null,
        production_cost: fProductionCost ? parseFloat(fProductionCost) : null,
        notes: fNotes.trim() || null,
      };

      if (fSelectedWOId) {
        payload.work_order_id = parseInt(fSelectedWOId, 10);
      }

      await api("/api/v1/finished-goods", {
        method: "POST",
        json: payload,
      });

      setSaveSuccess(`"${fProductName.trim()}" added to finished goods.`);
      resetForm();
      setFormOpen(false);
      loadData();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save finished good. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalSKUs = rows.length;
  const totalUnits = rows.reduce(
    (acc, r) => acc + (r.quantity_in_stock ?? 0),
    0,
  );
  const totalValue = rows.reduce(
    (acc, r) => acc + (r.quantity_in_stock ?? 0) * (r.production_cost ?? 0),
    0,
  );
  const lowStockCount = rows.filter(
    (r) => r.quantity_in_stock < LOW_STOCK_THRESHOLD,
  ).length;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-full space-y-6 pb-10"
      style={{ background: "#0b0f14" }}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          PAGE HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Finished Goods</h1>
          <p className="mt-1 text-sm text-slate-400">
            Completed production stock ready for dispatch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              className={`inline-block text-sm ${loading ? "animate-spin" : ""}`}
            >
              ↻
            </span>
            Refresh
          </button>
          <button
            type="button"
            onClick={toggleForm}
            className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
              formOpen
                ? "border-slate-600 bg-white/5 text-slate-300 hover:bg-white/10"
                : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            {formOpen ? "✕ Close Form" : "+ Add Finished Good"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STATS ROW
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 3L3 7.5V14L10 18L17 14V7.5L10 3z"/><path d="M3 7.5L10 12L17 7.5"/><path d="M10 12V18"/></svg>}
          label="Total SKUs"
          value={loading ? "—" : totalSKUs.toLocaleString()}
          sub="unique products"
        />
        <StatCard
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>}
          label="Total Units"
          value={loading ? "—" : totalUnits.toLocaleString()}
          sub="quantity in stock"
        />
        <StatCard
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="10" cy="10" r="8"/><path d="M10 6v1.5M10 12.5V14M7.5 8.5a2.5 2.5 0 015 0c0 1.5-1 2-2.5 2.5s-2.5 1-2.5 2.5a2.5 2.5 0 005 0"/></svg>}
          label="Total Value"
          value={loading ? "—" : fmtCompact(totalValue)}
          sub="qty × production cost"
        />
        <StatCard
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-amber-400"><path d="M10 2L2 17h16L10 2z"/><path d="M10 8v4M10 14.5v.5"/></svg>}
          label="Low Stock"
          value={loading ? "—" : lowStockCount}
          sub={`items below ${LOW_STOCK_THRESHOLD} units`}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SUCCESS BANNER (after save)
      ══════════════════════════════════════════════════════════════════════ */}
      {saveSuccess && <SuccessAlert message={saveSuccess} />}

      {/* ══════════════════════════════════════════════════════════════════════
          COLLAPSIBLE ADD FORM
      ══════════════════════════════════════════════════════════════════════ */}
      {formOpen && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          {/* Form header */}
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
            <h2 className="text-sm font-semibold text-white">
              Add Finished Good
            </h2>
            <button
              type="button"
              onClick={toggleForm}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
              title="Collapse form"
            >
              ✕
            </button>
          </div>

          {/* Form body */}
          <form id="fg-form" onSubmit={handleSave} className="px-5 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Product Name */}
              <FormField label="Product Name" required>
                <Input
                  placeholder="e.g. Steel Railing Frame"
                  value={fProductName}
                  onChange={(e) => setFProductName(e.target.value)}
                  required
                />
              </FormField>

              {/* Product Code */}
              <FormField label="Product Code">
                <Input
                  placeholder="e.g. SRF-001"
                  value={fProductCode}
                  onChange={(e) => setFProductCode(e.target.value)}
                />
              </FormField>

              {/* Category */}
              <FormField label="Category">
                <Input
                  placeholder="e.g. Structural"
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                />
              </FormField>

              {/* Quantity */}
              <FormField label="Quantity in Stock" required>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={fQty}
                  onChange={(e) => setFQty(e.target.value)}
                  required
                />
              </FormField>

              {/* Work Order selector */}
              <FormField label="Work Order">
                <Select
                  value={fSelectedWOId}
                  onChange={(e) => handleWOSelect(e.target.value)}
                >
                  <option value="">— select work order (optional) —</option>
                  {woOptions.map((wo) => (
                    <option key={wo.id} value={String(wo.id)}>
                      {wo.work_order_number}
                      {wo.party_name ? ` — ${wo.party_name}` : ""}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* WO Number (manual override) */}
              <FormField label="WO Number (manual)">
                <Input
                  placeholder="Auto-filled from WO selector"
                  value={fWONumber}
                  onChange={(e) => setFWONumber(e.target.value)}
                />
              </FormField>

              {/* Party Name */}
              <FormField label="Party Name">
                <Input
                  placeholder="Customer / party"
                  value={fPartyName}
                  onChange={(e) => setFPartyName(e.target.value)}
                />
              </FormField>

              {/* Completion Date */}
              <FormField label="Completion Date">
                <Input
                  type="date"
                  value={fCompletionDate}
                  onChange={(e) => setFCompletionDate(e.target.value)}
                />
              </FormField>

              {/* Production Cost */}
              <FormField label="Production Cost (₹)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={fProductionCost}
                  onChange={(e) => setFProductionCost(e.target.value)}
                />
              </FormField>
            </div>

            {/* Notes — full width */}
            <div className="mt-4">
              <FormField label="Notes">
                <Textarea
                  rows={3}
                  placeholder="Any additional notes…"
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                />
              </FormField>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="mt-4">
                <ErrorAlert message={saveError} />
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex items-center justify-end gap-3 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="fg-form"
                disabled={saving || !fProductName.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving…
                  </>
                ) : (
                  "Save Finished Good"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LOAD ERROR
      ══════════════════════════════════════════════════════════════════════ */}
      {loadError && <ErrorAlert message={loadError} />}

      {/* ══════════════════════════════════════════════════════════════════════
          FINISHED GOODS TABLE
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="overflow-hidden rounded-xl border border-surface-border">
        {/* Table header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-card px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Stock Inventory</h2>
            {!loading && (
              <p className="text-[11px] text-slate-500">
                {rows.length} record{rows.length !== 1 ? "s" : ""} · sorted by completion date
                {lowStockCount > 0 && (
                  <span className="ml-2 text-yellow-400">· {lowStockCount} low stock</span>
                )}
              </p>
            )}
          </div>
          <div className="relative min-w-[200px]">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-slate-500">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3 w-3"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
            </span>
            <input type="search" value={searchInput} placeholder="Search product, WO #, party…"
              onChange={e => setSearchInput(e.target.value)}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] py-1 pl-7 pr-2 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-[#0f1419]/80">
              <tr>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Product
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Code
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Qty in Stock
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  WO #
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Party
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Completed
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Production Cost
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                /* Loading skeleton — 6 placeholder rows */
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-border/40">
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-3.5 w-10" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-3.5 w-20" />
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : rows.length === 0 && !loadError ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-16 text-center text-sm text-slate-600"
                  >
                    No finished goods records found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isLowStock =
                    row.quantity_in_stock < LOW_STOCK_THRESHOLD;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-surface-border/40 transition-colors last:border-b-0 hover:bg-white/[0.025] ${
                        isLowStock ? "bg-yellow-500/[0.04]" : ""
                      }`}
                    >
                      {/* Product name */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-white">
                          {row.product_name}
                        </span>
                        {row.notes && (
                          <p
                            className="mt-0.5 max-w-[14rem] truncate text-[10px] text-slate-500"
                            title={row.notes}
                          >
                            {row.notes}
                          </p>
                        )}
                      </td>

                      {/* Code */}
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {row.product_code ?? "—"}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {row.product_category ?? "—"}
                      </td>

                      {/* Qty in stock */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 font-mono text-sm font-semibold ${
                            isLowStock ? "text-yellow-400" : "text-white"
                          }`}
                        >
                          {isLowStock && (
                            <span title="Low stock" className="text-yellow-400">
                              ⚠
                            </span>
                          )}
                          {row.quantity_in_stock.toLocaleString()}
                        </span>
                      </td>

                      {/* WO# */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {row.work_order_number ?? "—"}
                      </td>

                      {/* Party */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {row.party_name ?? "—"}
                      </td>

                      {/* Completed */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {fmtDate(row.completion_date)}
                      </td>

                      {/* Production cost */}
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-300">
                        {fmtCurrency(row.production_cost)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {row.quantity_in_stock > 0 && (
                          <button
                            type="button"
                            onClick={() => openReturn(row)}
                            className="whitespace-nowrap rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-400 transition hover:border-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                          >
                            → Inventory
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Return to Inventory modal ─────────────────────────────────────── */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Return to Inventory</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  From: <span className="text-slate-300">{returnTarget.product_name}</span>
                  {" "}· Available: <span className="font-semibold text-emerald-400">{returnTarget.quantity_in_stock}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeReturn}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReturn} className="space-y-4 px-6 py-5">
              {returnError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  ⚠ {returnError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Quantity to return <span className="text-red-400">*</span>
                  <span className="ml-1 text-slate-600">(max {returnTarget.quantity_in_stock})</span>
                </label>
                <input
                  type="number" step="any" min="0.001"
                  max={returnTarget.quantity_in_stock}
                  required autoFocus
                  value={rvQty}
                  onChange={e => setRvQty(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                  placeholder={`0 – ${returnTarget.quantity_in_stock}`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Material name in inventory <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" required
                  value={rvMatName}
                  onChange={e => setRvMatName(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                  placeholder="Matches existing or creates new"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Unit</label>
                  <input
                    type="text"
                    value={rvUnit}
                    onChange={e => setRvUnit(e.target.value)}
                    className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                    placeholder="Nos"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Cost per unit
                    {rvFoundPrice !== null && (
                      <span className="ml-1.5 text-emerald-400">(from inventory)</span>
                    )}
                  </label>
                  <input
                    type="number" step="any" min="0"
                    value={rvCost}
                    onChange={e => { setRvCost(e.target.value); setRvFoundPrice(null); }}
                    className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Notes</label>
                <textarea
                  rows={2}
                  value={rvNotes}
                  onChange={e => setRvNotes(e.target.value)}
                  className="w-full resize-none rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                  placeholder="Optional — reason or batch info"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeReturn}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returning || !rvQty || !rvMatName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {returning ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Returning…
                    </>
                  ) : (
                    "Return → Inventory"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
