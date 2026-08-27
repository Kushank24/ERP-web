"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
type Material = {
  id: number;
  name: string;
  length_weight_nos: number;
  unit: string;
  per_unit_cost: number;
  created_at: string;
};

type EditDraft = {
  name: string;
  qty: string;
  unit: string;
  cost: string;
};

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────────── */
const UNITS = ["Nos", "Kg", "Meter", "Set"] as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function fmtINR(n: number): string {
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────────────── */

/** Animated skeleton row used while the initial fetch is in-flight. */
function SkeletonRow() {
  return (
    <tr className="border-b border-surface-border/60">
      {[16, 140, 56, 48, 72, 80, 40].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-3.5 animate-pulse rounded bg-surface-border/50"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

/** Dismissable inline red alert banner. */
function ErrorAlert({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-base leading-none text-red-400">
          ⚠
        </span>
        <span className="leading-snug">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="shrink-0 text-red-400/60 transition hover:text-red-300"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* Shared Tailwind class strings for form inputs */
const inputCls =
  "w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20";

const inlineCls =
  "rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-sm text-white outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20";

/* ─────────────────────────────────────────────────────────────────────────────
   Page component
───────────────────────────────────────────────────────────────────────────── */
export default function InventoryPage() {
  /* ── List state ──────────────────────────────────────────────────────── */
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Search ──────────────────────────────────────────────────────────── */
  const [search, setSearch] = useState("");

  /* ── Inline edit ─────────────────────────────────────────────────────── */
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  /* ── Add form ────────────────────────────────────────────────────────── */
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("Nos");
  const [addCost, setAddCost] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  /* ── Convert to Finished Good modal ─────────────────────────────────── */
  const [convertTarget, setConvertTarget] = useState<Material | null>(null);
  const [cvQty, setCvQty] = useState("");
  const [cvName, setCvName] = useState("");
  const [cvCode, setCvCode] = useState("");
  const [cvCategory, setCvCategory] = useState("");
  const [cvNotes, setCvNotes] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  /* ── Load materials ──────────────────────────────────────────────────── */
  const loadMaterials = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Material[]>("/api/v1/materials")
      .then((data) => {
        setMaterials(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? "Failed to load materials");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  /* ── Derived stats ───────────────────────────────────────────────────── */
  const totalValue = useMemo(
    () =>
      materials.reduce(
        (acc, m) => acc + m.length_weight_nos * m.per_unit_cost,
        0,
      ),
    [materials],
  );

  const lowStock = useMemo(
    () => materials.filter((m) => m.length_weight_nos < 10),
    [materials],
  );

  /* ── Client-side search filter ───────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, search]);

  /* ── Inline-edit handlers ────────────────────────────────────────────── */
  function startEdit(m: Material) {
    setEditId(m.id);
    setDraft({
      name: m.name,
      qty: String(m.length_weight_nos),
      unit: m.unit,
      cost: String(m.per_unit_cost),
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    if (!draft) return;

    const patch = {
      name: draft.name.trim() || undefined,
      length_weight_nos: parseFloat(draft.qty) || 0,
      unit: draft.unit || undefined,
      per_unit_cost: parseFloat(draft.cost) || 0,
    };

    /* Snapshot for potential rollback */
    const snapshot = materials.slice();

    /* ── Optimistic update – close edit mode immediately ── */
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              name: patch.name ?? m.name,
              length_weight_nos: patch.length_weight_nos,
              unit: patch.unit ?? m.unit,
              per_unit_cost: patch.per_unit_cost,
            }
          : m,
      ),
    );
    setEditId(null);
    setDraft(null);

    try {
      await api(`/api/v1/materials/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      /* Revert on failure and surface the error */
      setMaterials(snapshot);
      setEditError(e instanceof Error ? e.message : "Failed to save changes.");
    }
  }

  /* ── Add-material handler ────────────────────────────────────────────── */
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await api<Material>("/api/v1/materials", {
        method: "POST",
        json: {
          name: addName.trim(),
          length_weight_nos: parseFloat(addQty) || 0,
          unit: addUnit,
          per_unit_cost: parseFloat(addCost) || 0,
        },
      });
      setMaterials((prev) => [...prev, created]);
      /* Clear the form and collapse */
      setAddName("");
      setAddQty("");
      setAddUnit("Nos");
      setAddCost("");
      setShowAdd(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add material.");
    } finally {
      setAdding(false);
    }
  }

  function resetAddForm() {
    setAddName("");
    setAddQty("");
    setAddUnit("Nos");
    setAddCost("");
    setAddError(null);
    setShowAdd(false);
  }

  function openConvert(m: Material) {
    setConvertTarget(m);
    setCvQty("");
    setCvName(m.name);
    setCvCode("");
    setCvCategory("");
    setCvNotes("");
    setConvertError(null);
  }

  function closeConvert() {
    setConvertTarget(null);
    setConvertError(null);
  }

  async function handleConvert(e: FormEvent) {
    e.preventDefault();
    if (!convertTarget) return;
    setConverting(true);
    setConvertError(null);
    try {
      const result = await api<{ material: Material; finished_good: object }>(
        `/api/v1/materials/${convertTarget.id}/convert`,
        {
          method: "POST",
          json: {
            quantity: parseFloat(cvQty),
            product_name: cvName.trim(),
            product_code: cvCode.trim() || null,
            product_category: cvCategory.trim() || null,
            notes: cvNotes.trim() || null,
          },
        },
      );
      setMaterials((prev) =>
        prev.map((m) => (m.id === convertTarget.id ? result.material : m)),
      );
      closeConvert();
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ════════════════════════════════════════════════════════════════
          Header
      ════════════════════════════════════════════════════════════════ */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Inventory</h1>
        <p className="mt-1 text-sm text-slate-400">Raw materials stock</p>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Stats row — 3 metric cards
      ════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Total Materials */}
        <div className="flex items-start gap-4 rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 3L3 7.5V14L10 18L17 14V7.5L10 3z"/><path d="M3 7.5L10 12L17 7.5"/><path d="M10 12V18"/></svg>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Total Materials
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {loading ? (
                <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-border/50" />
              ) : (
                materials.length
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">unique items</p>
          </div>
        </div>

        {/* Total Value */}
        <div className="flex items-start gap-4 rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="10" cy="10" r="8"/><path d="M10 6v1.5M10 12.5V14M7.5 8.5a2.5 2.5 0 015 0c0 1.5-1 2-2.5 2.5s-2.5 1-2.5 2.5a2.5 2.5 0 005 0"/></svg>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Total Value
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {loading ? (
                <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-border/50" />
              ) : (
                fmtINR(totalValue)
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">qty × cost/unit</p>
          </div>
        </div>

        {/* Low Stock */}
        <div
          className={`flex items-start gap-4 rounded-xl border bg-surface-card p-5 transition-colors ${
            !loading && lowStock.length > 0
              ? "border-orange-500/40"
              : "border-surface-border"
          }`}
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              !loading && lowStock.length > 0
                ? "bg-orange-500/10 text-orange-400"
                : "bg-surface-border/30 text-slate-600"
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 2L2 17h16L10 2z"/><path d="M10 8v4M10 14.5v.5"/></svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Low Stock
              </p>
              {!loading && lowStock.length > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                  ⚠ Alert
                </span>
              )}
            </div>
            <p
              className={`mt-1 text-2xl font-semibold ${
                !loading && lowStock.length > 0
                  ? "text-orange-400"
                  : "text-white"
              }`}
            >
              {loading ? (
                <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-border/50" />
              ) : (
                lowStock.length
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              items with qty &lt; 10
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Global alerts
      ════════════════════════════════════════════════════════════════ */}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {editError && (
        <ErrorAlert
          message={`Update failed — changes reverted: ${editError}`}
          onDismiss={() => setEditError(null)}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════
          Search + Table
      ════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-surface-border bg-surface-card">
        {/* Panel header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-white">Raw Materials</h2>
            {!loading && (
              <p className="text-[11px] text-slate-500">
                {filtered.length} of {materials.length}{" "}
                {materials.length === 1 ? "item" : "items"}
              </p>
            )}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-500">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
            </span>
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 rounded-lg border border-surface-border bg-[#0f1419] py-1.5 pl-8 pr-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border/80 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-12 px-5 py-3">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Qty / Weight</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Cost / Unit (₹)</th>
                <th className="px-4 py-3">Total Value (₹)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* ── Loading skeletons ── */}
              {loading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {/* ── Empty state ── */}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-14 text-center text-sm text-slate-500"
                  >
                    {search.trim() ? (
                      <>
                        No materials matching{" "}
                        <span className="font-medium text-slate-300">
                          &ldquo;{search}&rdquo;
                        </span>
                        .{" "}
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="text-accent underline underline-offset-2 transition hover:text-accent/80"
                        >
                          Clear search
                        </button>
                      </>
                    ) : (
                      "No materials yet. Use the form below to add one."
                    )}
                  </td>
                </tr>
              )}

              {/* ── Data rows ── */}
              {!loading &&
                filtered.map((m, idx) => {
                  const isLow = m.length_weight_nos < 10;
                  const isEditing = editId === m.id;

                  /* ── Edit row ── */
                  if (isEditing && draft) {
                    const draftQty = parseFloat(draft.qty) || 0;
                    const draftCost = parseFloat(draft.cost) || 0;

                    return (
                      <tr
                        key={m.id}
                        className="border-b border-surface-border/60 bg-accent/[0.06]"
                      >
                        {/* # */}
                        <td className="px-5 py-2.5 text-xs text-slate-500">
                          {idx + 1}
                        </td>

                        {/* Name input */}
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, name: e.target.value } : d,
                              )
                            }
                            className={`${inlineCls} w-full min-w-[130px]`}
                          />
                        </td>

                        {/* Qty input */}
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={draft.qty}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, qty: e.target.value } : d,
                              )
                            }
                            className={`${inlineCls} w-24`}
                          />
                        </td>

                        {/* Unit select */}
                        <td className="px-4 py-2.5">
                          <select
                            value={draft.unit}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, unit: e.target.value } : d,
                              )
                            }
                            className="rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-sm text-white outline-none transition focus:border-accent/70"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Cost input */}
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={draft.cost}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, cost: e.target.value } : d,
                              )
                            }
                            className={`${inlineCls} w-28`}
                          />
                        </td>

                        {/* Live total from draft values */}
                        <td className="px-4 py-2.5 tabular-nums text-xs text-slate-400">
                          {fmtINR(draftQty * draftCost)}
                        </td>

                        {/* Save / Cancel */}
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveEdit(m.id)}
                              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent/80"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-md border border-surface-border px-3 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  /* ── Normal read row ── */
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-surface-border/60 text-slate-300 transition-colors hover:bg-white/[0.025] ${
                        isLow ? "bg-amber-950/25" : ""
                      }`}
                    >
                      {/* # */}
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {idx + 1}
                      </td>

                      {/* Name + low-stock warning icon */}
                      <td className="px-4 py-3.5 font-medium text-white">
                        <span className="flex items-center gap-2">
                          {m.name}
                          {isLow && (
                            <span
                              title={`Low stock: only ${m.length_weight_nos} ${m.unit} remaining`}
                              className="text-sm text-amber-400"
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Qty — amber when low */}
                      <td className="px-4 py-3.5 tabular-nums">
                        <span
                          className={
                            isLow
                              ? "font-semibold text-amber-300"
                              : "text-slate-300"
                          }
                        >
                          {m.length_weight_nos}
                        </span>
                      </td>

                      {/* Unit badge */}
                      <td className="px-4 py-3.5">
                        <span className="rounded-full border border-surface-border/80 px-2 py-0.5 text-[11px] text-slate-400">
                          {m.unit}
                        </span>
                      </td>

                      {/* Cost per unit */}
                      <td className="px-4 py-3.5 tabular-nums">
                        {fmtINR(m.per_unit_cost)}
                      </td>

                      {/* Total value */}
                      <td className="px-4 py-3.5 font-medium tabular-nums text-white">
                        {fmtINR(m.length_weight_nos * m.per_unit_cost)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Convert to Finished Good"
                            disabled={editId !== null || m.length_weight_nos <= 0}
                            onClick={() => openConvert(m)}
                            className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            → FG
                          </button>
                          <button
                            type="button"
                            title="Edit row"
                            disabled={editId !== null}
                            onClick={() => startEdit(m)}
                            className="rounded-md border border-surface-border/70 px-2.5 py-1 text-base leading-none transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Table footer — totals for visible rows */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/60 px-5 py-2.5 text-xs text-slate-500">
            <span>
              {filtered.length} {filtered.length === 1 ? "item" : "items"}
              {search.trim() && (
                <span>
                  {" "}
                  matching{" "}
                  <span className="text-slate-400">&ldquo;{search}&rdquo;</span>
                </span>
              )}
            </span>
            <span>
              Filtered value:{" "}
              <span className="font-semibold text-white">
                {fmtINR(
                  filtered.reduce(
                    (acc, m) => acc + m.length_weight_nos * m.per_unit_cost,
                    0,
                  ),
                )}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Add Material form — collapsible
      ════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-surface-border bg-surface-card">
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => {
            if (showAdd) {
              resetAddForm();
            } else {
              setShowAdd(true);
            }
          }}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                showAdd
                  ? "bg-accent/20 text-accent"
                  : "bg-surface-border/60 text-slate-400"
              }`}
            >
              +
            </span>
            <span className="text-sm font-semibold text-white">
              Add New Material
            </span>
          </div>
          <span
            className="text-slate-500 transition-transform duration-200"
            style={{
              display: "inline-block",
              transform: showAdd ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            ▾
          </span>
        </button>

        {/* Collapsible form body */}
        {showAdd && (
          <>
            <div className="border-t border-surface-border" />
            <form onSubmit={handleAdd} className="px-5 pb-5 pt-4">
              {addError && (
                <div className="mb-4">
                  <ErrorAlert
                    message={addError}
                    onDismiss={() => setAddError(null)}
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Material Name */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Material Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Steel Rod"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Unit */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Unit
                  </label>
                  <select
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    className={inputCls}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cost / Unit */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Cost / Unit (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={addCost}
                    onChange={(e) => setAddCost(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Live preview */}
              {addName.trim() && (
                <div className="mt-3 rounded-lg border border-surface-border/60 bg-[#0f1419] px-3.5 py-2.5 text-xs text-slate-500">
                  Preview:{" "}
                  <span className="font-medium text-slate-300">
                    {addName.trim()}
                  </span>{" "}
                  —{" "}
                  <span className="text-slate-300">
                    {addQty || "0"} {addUnit}
                  </span>{" "}
                  @ ₹{addCost || "0"} ={" "}
                  <span className="font-semibold text-white">
                    {fmtINR(
                      (parseFloat(addQty) || 0) * (parseFloat(addCost) || 0),
                    )}
                  </span>
                </div>
              )}

              {/* Form action buttons */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={adding || !addName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adding ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Adding…
                    </>
                  ) : (
                    "➕ Add Material"
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:bg-white/[0.04] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Convert to Finished Good — modal overlay
      ════════════════════════════════════════════════════════════════ */}
      {convertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-[#0d1117] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Convert to Finished Good</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  From: <span className="text-slate-300">{convertTarget.name}</span>
                  {" "}· Available: <span className="font-semibold text-emerald-400">{convertTarget.length_weight_nos} {convertTarget.unit}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeConvert}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleConvert} className="space-y-4 px-6 py-5">
              {convertError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  ⚠ {convertError}
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Quantity to convert <span className="text-red-400">*</span>
                  <span className="ml-1 text-slate-600">(max {convertTarget.length_weight_nos} {convertTarget.unit})</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  max={convertTarget.length_weight_nos}
                  required
                  value={cvQty}
                  onChange={(e) => setCvQty(e.target.value)}
                  className={inputCls}
                  placeholder={`0 – ${convertTarget.length_weight_nos}`}
                  autoFocus
                />
              </div>

              {/* FG Name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Finished Good Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cvName}
                  onChange={(e) => setCvName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Steel Bracket"
                />
              </div>

              {/* Code + Category in a row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Product Code</label>
                  <input
                    type="text"
                    value={cvCode}
                    onChange={(e) => setCvCode(e.target.value)}
                    className={inputCls}
                    placeholder="SKU-001"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Category</label>
                  <input
                    type="text"
                    value={cvCategory}
                    onChange={(e) => setCvCategory(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Fabricated"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Notes</label>
                <textarea
                  rows={2}
                  value={cvNotes}
                  onChange={(e) => setCvNotes(e.target.value)}
                  className={`${inputCls} resize-none`}
                  placeholder="Optional — reason or batch info"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeConvert}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={converting || !cvQty || !cvName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {converting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Converting…
                    </>
                  ) : (
                    "Convert → Finished Good"
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
