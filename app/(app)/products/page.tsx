"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type BoqLine = {
  id: number;
  name: string;
  section_size: number;
  units: string;
  quantity: number;
  total_quantity_consumed: number;
};

// list response — BOQ not included; loaded lazily on expand
type ProductSummary = {
  id: number;
  name: string;
  product_code: string | null;
  description: string | null;
  category: string | null;
  default_unit_price: number;
  boq_count: number;
};

// full detail response from GET /products/{id}
type ProductDetail = ProductSummary & {
  bill_of_quantities: BoqLine[];
};

type SpecCatalogEntry = {
  id: number;
  name: string;
  product_count: number;
};

type ProductSpec = {
  specification_id: number;
  spec_name: string;
  display_order: number;
};

type ListResponse = {
  items: ProductSummary[];
  total: number;
  page: number;
  page_size: number;
};

type DraftLine = {
  key: string;
  name: string;
  section_size: string;
  units: string;
  quantity: string;
};

type UploadResult = {
  created: number;
  skipped: number;
  created_names: string[];
  skipped_names: string[];
  errors: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = ["Nos", "Kg", "Meter", "Set"] as const;
const UNCATEGORIZED = "";

let _keySeq = 0;
const nextKey = () => `dl-${++_keySeq}`;

const blankLine = (): DraftLine => ({
  key: nextKey(),
  name: "",
  section_size: "",
  units: "Nos",
  quantity: "",
});

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AccordionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-center justify-between rounded-xl border border-surface-border bg-surface-card px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded bg-slate-700" />
            <div className="h-4 w-40 rounded bg-slate-700" />
            <div className="h-4 w-16 rounded bg-slate-800" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-20 rounded bg-slate-800" />
            <div className="h-5 w-12 rounded-full bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd(): void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-surface-border bg-[#0f1419] text-slate-500">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="4" y="4" width="12" height="14" rx="1"/><path d="M8 2h4a1 1 0 011 1v2a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M7 10h6M7 13h4"/></svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-200">No products yet</p>
      <p className="mt-1 text-xs text-slate-500">Create your first product with bill of quantities</p>
      <button type="button" onClick={onAdd} className="mt-5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90">
        + Add Product
      </button>
    </div>
  );
}

// ─── BOQ Table ────────────────────────────────────────────────────────────────

function MaterialDatalist({ id, names }: { id: string; names: string[] }) {
  return (
    <datalist id={id}>
      {names.map((n) => <option key={n} value={n} />)}
    </datalist>
  );
}

function BoqTable({
  lines,
  productId,
  onDelete,
  deletingId,
  onRefresh,
}: {
  lines: BoqLine[];
  productId: number;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  onRefresh: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSS, setEditSS] = useState("");
  const [editUnits, setEditUnits] = useState("Nos");
  const [editQty, setEditQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  function startEdit(b: BoqLine) {
    setEditingId(b.id);
    setEditSS(String(b.section_size));
    setEditUnits(b.units);
    setEditQty(String(b.quantity));
    setSaveErr(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await api(`/api/v1/products/${productId}/boq/${editingId}`, {
        method: "PATCH",
        json: { section_size: parseFloat(editSS) || 0, units: editUnits, quantity: parseFloat(editQty) || 1 },
      });
      setEditingId(null);
      onRefresh();
    } catch (ex) {
      setSaveErr(ex instanceof Error ? ex.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!lines.length) return <p className="text-xs italic text-slate-500">No BOQ lines defined.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-surface-border">
            {["Material", "Section Size", "Units", "Qty", "Total Consumed"].map((h) => (
              <th key={h} className="pb-2 pr-6 text-[10px] font-semibold uppercase tracking-wider text-slate-500 last:pr-0">{h}</th>
            ))}
            <th className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500" />
            {onDelete && <th className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((b) =>
            editingId === b.id ? (
              <tr key={b.id} className="border-b border-accent/20 bg-accent/[0.04]">
                <td className="py-2 pr-4 text-sm font-medium text-slate-200">{b.name}</td>
                <td className="py-2 pr-3">
                  <input type="number" step="any" min="0" value={editSS} onChange={(e) => setEditSS(e.target.value)}
                    className="w-16 rounded border border-surface-border bg-[#0f1419] px-2 py-1 text-xs text-white focus:border-accent focus:outline-none" />
                </td>
                <td className="py-2 pr-3">
                  <select value={editUnits} onChange={(e) => setEditUnits(e.target.value)}
                    className="rounded border border-surface-border bg-[#0f1419] px-1.5 py-1 text-xs text-white focus:border-accent focus:outline-none">
                    {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input type="number" step="any" min="0.01" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                    className="w-16 rounded border border-surface-border bg-[#0f1419] px-2 py-1 text-xs text-white focus:border-accent focus:outline-none" />
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-emerald-400">
                  {((parseFloat(editSS) || 0) * (parseFloat(editQty) || 0)).toFixed(3)}
                </td>
                <td className="py-2 pr-1" colSpan={onDelete ? 1 : 2}>
                  <div className="flex flex-col gap-1">
                    {saveErr && <span className="text-[10px] text-red-400">{saveErr}</span>}
                    <div className="flex gap-1">
                      <button type="button" disabled={saving} onClick={saveEdit}
                        className="rounded bg-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50">
                        {saving ? "…" : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="rounded px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                </td>
                {onDelete && <td className="py-2" />}
              </tr>
            ) : (
              <tr key={b.id} className="group border-b border-surface-border/30 text-sm last:border-0">
                <td className="py-2.5 pr-6 font-medium text-slate-200">{b.name}</td>
                <td className="py-2.5 pr-6 text-slate-400">{b.section_size}</td>
                <td className="py-2.5 pr-6"><span className="rounded bg-[#0f1419] px-2 py-0.5 text-[11px] text-slate-300">{b.units}</span></td>
                <td className="py-2.5 pr-6 text-slate-400">{b.quantity}</td>
                <td className="py-2.5 font-mono text-xs text-emerald-400">{b.total_quantity_consumed.toFixed(3)}</td>
                <td className="py-2.5 pl-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => startEdit(b)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-700/50 hover:text-slate-300" title="Edit BOQ line">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M11 2l3 3-9 9H2v-3L11 2z" /></svg>
                  </button>
                </td>
                {onDelete && (
                  <td className="py-2.5 pl-1">
                    <button type="button" disabled={deletingId === b.id} onClick={() => onDelete(b.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400 disabled:opacity-40" title="Remove BOQ line">
                      {deletingId === b.id ? "…" : "✕"}
                    </button>
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Specifications Panel ─────────────────────────────────────────────────────

function SpecificationsPanel({
  productId, catalog, onCatalogChange,
}: {
  productId: number;
  catalog: SpecCatalogEntry[];
  onCatalogChange: () => void;
}) {
  const [assigned, setAssigned] = useState<ProductSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [newSpecName, setNewSpecName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<ProductSpec[]>(`/api/v1/products/${productId}/specifications`)
      .then(setAssigned)
      .catch(() => setAssigned([]))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setDraft((assigned ?? []).map((a) => a.specification_id));
    setFilter(""); setNewSpecName(""); setErr(null); setEditing(true);
  }

  function toggle(specId: number) {
    setDraft((p) => (p.includes(specId) ? p.filter((x) => x !== specId) : [...p, specId]));
  }

  async function handleAddNewSpec() {
    const name = newSpecName.trim();
    if (!name) return;
    setBusy(true); setErr(null);
    try {
      const created = await api<SpecCatalogEntry>("/api/v1/products/specifications/catalog", {
        method: "POST",
        json: { name },
      });
      setNewSpecName("");
      onCatalogChange();
      setDraft((p) => (p.includes(created.id) ? p : [...p, created.id]));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create specification");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true); setErr(null);
    try {
      const updated = await api<ProductSpec[]>(`/api/v1/products/${productId}/specifications`, {
        method: "PUT",
        json: { specification_ids: draft },
      });
      setAssigned(updated);
      setEditing(false);
      onCatalogChange();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to save specifications");
    } finally {
      setBusy(false);
    }
  }

  const visible = filter.trim()
    ? catalog.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : catalog;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Specifications
          {assigned !== null && (
            <span className="ml-2 rounded-full border border-surface-border bg-[#0f1419] px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-400">
              {assigned.length}
            </span>
          )}
        </p>
        <button type="button" onClick={editing ? () => setEditing(false) : startEdit} disabled={loading}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40">
          {editing ? "Cancel" : "Manage"}
        </button>
      </div>

      {loading ? (
        <div className="h-8 animate-pulse rounded bg-slate-800/60" />
      ) : editing ? (
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter specifications…"
            className="mb-3 w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />

          <div className="max-h-64 overflow-y-auto rounded border border-surface-border/60 bg-[#0b0f14] p-2">
            {visible.length === 0 ? (
              <p className="py-3 text-center text-xs italic text-slate-600">No specifications match.</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {visible.map((s) => (
                  <label key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/[0.04]">
                    <input type="checkbox" checked={draft.includes(s.id)} onChange={() => toggle(s.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-[color:var(--accent,#3b82f6)]" />
                    <span className="min-w-0 flex-1 truncate text-slate-200" title={s.name}>{s.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{s.product_count}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input type="text" value={newSpecName} onChange={(e) => setNewSpecName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNewSpec(); } }}
              placeholder="New specification name…"
              className="min-w-0 flex-1 rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
            <button type="button" onClick={handleAddNewSpec} disabled={busy || !newSpecName.trim()}
              className="shrink-0 rounded border border-surface-border px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent hover:text-accent disabled:opacity-40">
              + Create
            </button>
          </div>

          {err && <p className="mt-2 text-xs text-red-400" role="alert">{err}</p>}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{draft.length} selected</span>
            <button type="button" onClick={handleSave} disabled={busy}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
              {busy ? "Saving…" : "Save Specifications"}
            </button>
          </div>
        </div>
      ) : (assigned ?? []).length === 0 ? (
        <p className="text-xs italic text-slate-500">No specifications linked. Click Manage to add some.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(assigned ?? []).map((a) => (
            <span key={a.specification_id}
              className="rounded border border-surface-border bg-[#0f1419] px-2 py-0.5 text-[11px] text-slate-300">
              {a.spec_name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onRefresh, materialNames, specCatalog, onSpecCatalogChange }: {
  product: ProductSummary; onRefresh: () => void; materialNames: string[];
  specCatalog: SpecCatalogEntry[]; onSpecCatalogChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [boq, setBoq] = useState<BoqLine[] | null>(null);
  const [boqLoading, setBoqLoading] = useState(false);

  // Edit product state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(product.name);
  const [editCode, setEditCode] = useState(product.product_code ?? "");
  const [editCat, setEditCat] = useState(product.category ?? "");
  const [editPrice, setEditPrice] = useState(String(product.default_unit_price));
  const [editDesc, setEditDesc] = useState(product.description ?? "");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Add BOQ state
  const [showAdd, setShowAdd] = useState(false);
  const [boqName, setBoqName] = useState("");
  const [boqSectionSize, setBoqSectionSize] = useState("");
  const [boqUnits, setBoqUnits] = useState<string>("Nos");
  const [boqQty, setBoqQty] = useState("");
  const [boqSaving, setBoqSaving] = useState(false);
  const [boqErr, setBoqErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Lazy-load BOQ when accordion opens
  useEffect(() => {
    if (!open || boq !== null) return;
    setBoqLoading(true);
    api<ProductDetail>(`/api/v1/products/${product.id}`)
      .then((d) => setBoq(d.bill_of_quantities))
      .catch(() => setBoq([]))
      .finally(() => setBoqLoading(false));
  }, [open, product.id, boq]);

  function refreshBoq() {
    setBoq(null); // clear cache → triggers reload
    onRefresh();
  }

  function startEdit() {
    setEditName(product.name);
    setEditCode(product.product_code ?? "");
    setEditCat(product.category ?? "");
    setEditPrice(String(product.default_unit_price));
    setEditDesc(product.description ?? "");
    setEditErr(null);
    setEditing(true);
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setEditSaving(true);
    setEditErr(null);
    try {
      await api(`/api/v1/products/${product.id}`, {
        method: "PATCH",
        json: {
          name: editName.trim(),
          product_code: editCode.trim() || null,
          category: editCat.trim() || null,
          default_unit_price: parseFloat(editPrice) || 0,
          description: editDesc.trim() || null,
        },
      });
      setEditing(false);
      onRefresh();
    } catch (ex) {
      setEditErr(ex instanceof Error ? ex.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddBoq(e: FormEvent) {
    e.preventDefault();
    if (!boqName.trim() || !boqQty) return;
    setBoqSaving(true);
    setBoqErr(null);
    try {
      await api(`/api/v1/products/${product.id}/boq`, {
        method: "POST",
        json: {
          name: boqName.trim(),
          section_size: parseFloat(boqSectionSize) || 0,
          units: boqUnits,
          quantity: parseFloat(boqQty) || 0,
        },
      });
      setBoqName(""); setBoqSectionSize(""); setBoqUnits("Nos"); setBoqQty("");
      setShowAdd(false);
      refreshBoq();
    } catch (ex) {
      setBoqErr(ex instanceof Error ? ex.message : "Failed to add BOQ line");
    } finally {
      setBoqSaving(false);
    }
  }

  async function handleDeleteBoq(boqId: number) {
    setDeletingId(boqId);
    try {
      await api(`/api/v1/products/${product.id}/boq/${boqId}`, { method: "DELETE" });
      refreshBoq();
    } catch { /* silent */ } finally {
      setDeletingId(null);
    }
  }

  const boqCount = boq !== null ? boq.length : product.boq_count;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-white/[0.025]">
          <svg className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{product.name}</span>
            {product.product_code && (
              <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
                {product.product_code}
              </span>
            )}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={startEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200" title="Edit product">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M11 2l3 3-9 9H2v-3L11 2z" /></svg>
          </button>
          <span className="font-mono text-sm text-emerald-400">{inr(product.default_unit_price)}</span>
          <span className="rounded-full border border-surface-border bg-[#0f1419] px-2.5 py-0.5 text-[11px] text-slate-400">
            {boqCount} BOQ
          </span>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <form onSubmit={handleEditSave} className="border-t border-accent/20 bg-accent/[0.04] px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-accent">Edit Product</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] font-medium text-slate-400">Name *</label>
              <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-sm text-white focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-400">Product Code</label>
              <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)}
                className="w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-sm text-white focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-400">Category</label>
              <input type="text" value={editCat} onChange={(e) => setEditCat(e.target.value)}
                className="w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-sm text-white focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-400">Unit Price (₹)</label>
              <input type="number" step="any" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                className="w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-sm text-white focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-400">Description</label>
              <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                className="w-full rounded border border-surface-border bg-[#0f1419] px-2.5 py-1.5 text-sm text-white focus:border-accent focus:outline-none" />
            </div>
          </div>
          {editErr && <p className="mt-2 text-xs text-red-400" role="alert">{editErr}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)}
              className="rounded border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={editSaving}
              className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
              {editSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* Expanded body */}
      {open && (
        <div className="space-y-5 border-t border-surface-border px-5 py-5">
          {product.description && (
            <p className="text-sm leading-relaxed text-slate-400">{product.description}</p>
          )}

          <SpecificationsPanel productId={product.id} catalog={specCatalog} onCatalogChange={onSpecCatalogChange} />

          <div className="border-t border-surface-border/50" />

          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Bill of Quantities</p>
            <button type="button" onClick={() => { setShowAdd((v) => !v); setBoqErr(null); }}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20">
              {showAdd ? "Cancel" : "+ Add BOQ Line"}
            </button>
          </div>

          {boqLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-slate-800/60" />
              ))}
            </div>
          ) : (
            <BoqTable
              lines={boq ?? []}
              productId={product.id}
              onDelete={handleDeleteBoq}
              deletingId={deletingId}
              onRefresh={refreshBoq}
            />
          )}

          {showAdd && (
            <form onSubmit={handleAddBoq} className="rounded-lg border border-accent/20 bg-accent/5 p-4">
              <p className="mb-3 text-xs font-semibold text-accent">New BOQ Line</p>
              <MaterialDatalist id={`boq-mat-${product.id}`} names={materialNames} />
              <div className="grid grid-cols-[1fr_78px_72px_72px] gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">Material Name *</label>
                  <input type="text" required list={`boq-mat-${product.id}`} placeholder="Select or type…" value={boqName} onChange={(e) => setBoqName(e.target.value)}
                    className="w-full rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">Sec. Size</label>
                  <input type="number" step="any" min="0" placeholder="0" value={boqSectionSize} onChange={(e) => setBoqSectionSize(e.target.value)}
                    className="w-full rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">Units *</label>
                  <select value={boqUnits} onChange={(e) => setBoqUnits(e.target.value)}
                    className="w-full rounded border border-surface-border bg-[#0f1419] px-1.5 py-1.5 text-xs text-white focus:border-accent focus:outline-none">
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">Qty *</label>
                  <input type="number" step="any" min="0.01" required placeholder="1" value={boqQty} onChange={(e) => setBoqQty(e.target.value)}
                    className="w-full rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                </div>
              </div>
              {boqErr && <p className="mt-2 text-xs text-red-400" role="alert">{boqErr}</p>}
              <div className="mt-3 flex justify-end">
                <button type="submit" disabled={boqSaving}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
                  {boqSaving ? "Adding…" : "Add Line"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Product Panel ─────────────────────────────────────────────────────

function CreatePanel({ onClose, onCreated, materialNames, specCatalog, onSpecCatalogChange }: {
  onClose(): void; onCreated(): void; materialNames: string[];
  specCatalog: SpecCatalogEntry[]; onSpecCatalogChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [price, setPrice] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  // Step 2: assign specs after creation
  const [createdProductId, setCreatedProductId] = useState<number | null>(null);

  const addLine = () => setLines((p) => [...p, blankLine()]);
  const removeLine = (key: string) => setLines((p) => p.filter((l) => l.key !== key));
  const updateLine = (key: string, field: keyof DraftLine, value: string) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const validLines = lines.filter((l) => l.name.trim() !== "");
      const created = await api<{ id: number }>("/api/v1/products", {
        method: "POST",
        json: {
          name: name.trim(),
          ...(code.trim() && { product_code: code.trim() }),
          ...(desc.trim() && { description: desc.trim() }),
          ...(cat.trim() && { category: cat.trim() }),
          default_unit_price: parseFloat(price) || 0,
          boq_lines: validLines.map((l) => ({
            name: l.name.trim(),
            section_size: parseFloat(l.section_size) || 0,
            units: l.units,
            quantity: parseFloat(l.quantity) || 0,
          })),
        },
      });
      onCreated();
      setCreatedProductId(created.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create product");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <style>{`
        @keyframes esafe-slide-down { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .esafe-slide-down { animation: esafe-slide-down 0.22s ease-out both; }
      `}</style>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="esafe-slide-down absolute inset-x-0 top-0 z-50 mx-auto max-w-2xl rounded-b-2xl border border-t-0 border-surface-border bg-[#131c27] shadow-2xl">
          <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-white">{createdProductId ? "Assign Specifications" : "New Product"}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {createdProductId ? `Product "${name}" created · choose which specs apply to it` : "Fill product details and define bill of quantities"}
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white">✕</button>
          </div>

          {createdProductId ? (
            <div className="max-h-[82vh] overflow-y-auto px-6 py-6">
              <SpecificationsPanel productId={createdProductId} catalog={specCatalog} onCatalogChange={onSpecCatalogChange} />
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={onClose}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90">
                  Done
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className={createdProductId ? "hidden" : "max-h-[82vh] overflow-y-auto"}>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Product Name <span className="text-red-400">*</span></label>
                <input type="text" required placeholder="e.g. Safety Helmet Type-1" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Product Code</label>
                <input type="text" placeholder="e.g. SH-001" value={code} onChange={(e) => setCode(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Category</label>
                <input type="text" placeholder="e.g. PPE, Accessories" value={cat} onChange={(e) => setCat(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Default Unit Price (₹) <span className="text-red-400">*</span></label>
                <input type="number" step="any" min="0" required placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Description</label>
                <textarea rows={2} placeholder="Optional product description…" value={desc} onChange={(e) => setDesc(e.target.value)}
                  className="w-full resize-none rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
              </div>
            </div>
            <div className="border-t border-surface-border px-6 py-5">
              <MaterialDatalist id="boq-mat-create" names={materialNames} />
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Bill of Quantities</p>
                  <p className="mt-0.5 text-xs text-slate-500">Lines with blank names are ignored on save. Total = section size × quantity.</p>
                </div>
                <button type="button" onClick={addLine}
                  className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20">
                  + Add Line
                </button>
              </div>
              <div className="mb-2 grid grid-cols-[1fr_78px_72px_72px_72px_28px] gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                <span>Material Name</span><span>Sec. Size</span><span>Units</span><span>Qty</span><span>Total</span><span />
              </div>
              <div className="space-y-2">
                {lines.map((line) => {
                  const total = (parseFloat(line.section_size) || 0) * (parseFloat(line.quantity) || 0);
                  return (
                    <div key={line.key} className="grid grid-cols-[1fr_78px_72px_72px_72px_28px] items-center gap-2">
                      <input type="text" list="boq-mat-create" placeholder="Select or type…" value={line.name} onChange={(e) => updateLine(line.key, "name", e.target.value)}
                        className="min-w-0 rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                      <input type="number" step="any" min="0" placeholder="0" value={line.section_size} onChange={(e) => updateLine(line.key, "section_size", e.target.value)}
                        className="rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                      <select value={line.units} onChange={(e) => updateLine(line.key, "units", e.target.value)}
                        className="rounded border border-surface-border bg-[#0f1419] px-1.5 py-1.5 text-xs text-white focus:border-accent focus:outline-none">
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" step="any" min="0" placeholder="0" value={line.quantity} onChange={(e) => updateLine(line.key, "quantity", e.target.value)}
                        className="rounded border border-surface-border bg-[#0f1419] px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-accent focus:outline-none" />
                      <div className="rounded bg-emerald-950/30 px-1.5 py-1.5 text-center font-mono text-[11px] text-emerald-400">{total.toFixed(2)}</div>
                      <button type="button" disabled={lines.length === 1} onClick={() => removeLine(line.key)}
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30" title="Remove line">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-surface-border px-6 py-4">
              <div className="min-w-0 flex-1 pr-4">
                {err && <p className="truncate text-xs text-red-400" role="alert">{err}</p>}
              </div>
              <div className="flex shrink-0 gap-3">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
                <button type="submit" disabled={busy}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? "Creating…" : "Create Product"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Upload Result Banner ─────────────────────────────────────────────────────

function UploadBanner({ result, onClose }: { result: UploadResult; onClose(): void }) {
  const hasErrors = result.errors.length > 0;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${hasErrors ? "border-yellow-800/50 bg-yellow-950/30" : "border-emerald-800/50 bg-emerald-950/30"}`}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={`mt-0.5 h-4 w-4 shrink-0 ${hasErrors ? "text-yellow-400" : "text-emerald-400"}`}>
        {hasErrors ? <path d="M10 2L2 17h16L10 2zm0 6v4m0 3h.01" /> : <path d="M3 10l5 5L17 5" />}
      </svg>
      <div className="min-w-0 flex-1 text-sm">
        <p className={hasErrors ? "text-yellow-300" : "text-emerald-300"}>
          <span className="font-semibold">{result.created}</span> product{result.created !== 1 ? "s" : ""} created
          {result.skipped > 0 && <>, <span className="font-semibold">{result.skipped}</span> skipped (already exist)</>}
        </p>
        {result.errors.length > 0 && (
          <ul className="mt-1 space-y-0.5">{result.errors.map((e, i) => <li key={i} className="text-xs text-yellow-400/80">{e}</li>)}</ul>
        )}
        {result.skipped_names.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">Skipped: {result.skipped_names.join(", ")}</p>
        )}
      </div>
      <button type="button" onClick={onClose}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-300">✕</button>
    </div>
  );
}

// ─── Category Header ──────────────────────────────────────────────────────────

function CategoryHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 pb-1 pt-4 first:pt-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="rounded-full border border-surface-border bg-[#0f1419] px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
      <div className="h-px flex-1 bg-surface-border" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DISPLAY_LABEL: Record<string, string> = {};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search to avoid a request per keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [debouncedSearch, activeCat]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeCat !== null) params.set("category", activeCat);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    api<ListResponse>(`/api/v1/products?${params}`)
      .then((data) => { setProducts(data.items); setTotal(data.total); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debouncedSearch, activeCat, page]);

  useEffect(() => { load(); }, [load]);

  // Derive distinct categories from currently loaded items only when no filters active
  // (for the pill bar we fetch all categories separately to avoid missing ones)
  const [allCategories, setAllCategories] = useState<string[]>([]);
  useEffect(() => {
    api<string[]>("/api/v1/products/categories")
      .then((cats) => setAllCategories(cats))
      .catch(() => {});
  }, []);

  const [materialNames, setMaterialNames] = useState<string[]>([]);
  useEffect(() => {
    api<{ id: number; name: string }[]>("/api/v1/materials")
      .then((mats) => setMaterialNames(mats.map((m) => m.name)))
      .catch(() => {});
  }, []);

  const [specCatalog, setSpecCatalog] = useState<SpecCatalogEntry[]>([]);
  const loadSpecCatalog = useCallback(() => {
    api<SpecCatalogEntry[]>("/api/v1/products/specifications/catalog")
      .then(setSpecCatalog)
      .catch(() => {});
  }, []);
  useEffect(() => { loadSpecCatalog(); }, [loadSpecCatalog]);

  // Client-side filter on the current page when a search is active (already filtered server-side)
  const grouped = products.reduce<Map<string, ProductSummary[]>>((acc, p) => {
    const cat = p.category?.trim() || UNCATEGORIZED;
    if (!acc.has(cat)) acc.set(cat, []);
    acc.get(cat)!.push(p);
    return acc;
  }, new Map());

  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  const showGroupHeaders = activeCat === null && sortedGroups.length > 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<UploadResult>("/api/v1/products/bulk-upload", { method: "POST", body: form });
      setUploadResult(result);
      if (result.created > 0) load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const csv = [
      "name,product_code,category,default_unit_price,material_name,section_size,units,quantity",
      "Safety Helmet Type-1,SH-001,PPE,450,Strap,0,Nos,1",
      "Safety Helmet Type-1,SH-001,PPE,450,Steel Rod 16mm,12.5,Kg,2",
      "Work Gloves,WG-002,PPE,120,,,,",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {showCreate && <CreatePanel onClose={() => setShowCreate(false)} onCreated={load} materialNames={materialNames}
        specCatalog={specCatalog} onSpecCatalogChange={loadSpecCatalog} />}
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />

      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-white">Products &amp; BOQ</h1>
              {!loading && (
                <span className="rounded-full border border-surface-border bg-surface-card px-2.5 py-0.5 text-xs font-medium text-slate-400">
                  {total}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">Manage products and their bill of quantities.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadTemplate}
              className="rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white" title="Download CSV template">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5"><path d="M8 2v8m-3-3l3 3 3-3M3 13h10"/></svg>
              Template
            </button>
            <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5"><path d="M8 10V2m-3 3l3-3 3 3M3 13h10"/></svg>
              {uploading ? "Uploading…" : "Upload CSV / Excel"}
            </button>
            <button type="button" onClick={() => setShowCreate(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90">
              + Add Product
            </button>
          </div>
        </div>

        {uploadResult && <UploadBanner result={uploadResult} onClose={() => setUploadResult(null)} />}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-4">
            <span className="mt-0.5 text-red-400">⚠</span>
            <p className="text-sm text-red-300" role="alert">{error}</p>
          </div>
        )}

        {/* Toolbar: category pills + search */}
        <div className="flex flex-wrap items-center gap-3">
          {allCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setActiveCat(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${activeCat === null ? "border-accent bg-accent/20 text-accent" : "border-surface-border bg-transparent text-slate-400 hover:border-slate-600 hover:text-slate-300"}`}>
                All
              </button>
              {allCategories.map((cat) => (
                <button key={cat || "__unc"} type="button" onClick={() => setActiveCat((c) => (c === cat ? null : cat))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${activeCat === cat ? "border-accent bg-accent/20 text-accent" : "border-surface-border bg-transparent text-slate-400 hover:border-slate-600 hover:text-slate-300"}`}>
                  {cat || "Uncategorized"}
                </button>
              ))}
            </div>
          )}
          <div className="relative ml-auto">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
            </span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code or category…"
              className="w-64 rounded-lg border border-surface-border bg-[#0f1419] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30" />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <AccordionSkeleton />
        ) : products.length === 0 && !debouncedSearch && activeCat === null ? (
          <EmptyState onAdd={() => setShowCreate(true)} />
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border py-12 text-center">
            <p className="text-sm text-slate-400">No products match your filters.</p>
            <div className="mt-3 flex justify-center gap-3">
              {debouncedSearch && <button type="button" onClick={() => setSearch("")} className="text-xs text-accent hover:underline">Clear search</button>}
              {activeCat !== null && <button type="button" onClick={() => setActiveCat(null)} className="text-xs text-accent hover:underline">Show all categories</button>}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {sortedGroups.map(([cat, groupProducts]) => (
                <div key={cat || "__unc"}>
                  {showGroupHeaders && (
                    <CategoryHeader label={cat || "Uncategorized"} count={groupProducts.length} />
                  )}
                  <div className="space-y-3">
                    {groupProducts.map((p) => (
                      <ProductCard key={p.id} product={p} onRefresh={load} materialNames={materialNames}
                        specCatalog={specCatalog} onSpecCatalogChange={loadSpecCatalog} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-surface-border pt-4">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40">
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
