"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface CatalogProduct {
  id: number;
  model_name: string;
  code: string | null;
  category: string | null;
  definition: string | null;
  created_at: string;
}

interface SpecCatalogEntry { id: number; name: string; product_count: number; }
interface ProductSpec { id: number; specification_id: number; spec_name: string; display_order: number; }

const BLANK: Omit<CatalogProduct, "id" | "created_at"> = {
  model_name: "", code: "", category: "", definition: "",
};

export default function ProductCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [tab, setTab] = useState<"details" | "specs">("details");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // spec management
  const [specCatalog, setSpecCatalog] = useState<SpecCatalogEntry[]>([]);
  const [productSpecs, setProductSpecs] = useState<ProductSpec[]>([]);
  const [specSearch, setSpecSearch] = useState("");
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [newSpecName, setNewSpecName] = useState("");
  const [creatingSpec, setCreatingSpec] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());
    if (filterCat) params.set("category", filterCat);
    api<{ items: CatalogProduct[]; total: number }>(`/api/v1/catalog-products?${params}`)
      .then(r => { setProducts(r.items); setTotal(r.total); })
      .catch(e => setErr(e.message));
    api<string[]>("/api/v1/catalog-products/categories")
      .then(setCategories)
      .catch(() => {});
  }, [page, search, filterCat]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setSelected(null);
    setForm(BLANK);
    setCreating(true);
    setTab("details");
    setErr(null);
  }

  function openEdit(p: CatalogProduct) {
    setCreating(false);
    setSelected(p);
    setForm({ model_name: p.model_name, code: p.code ?? "", category: p.category ?? "", definition: p.definition ?? "" });
    setTab("details");
    setErr(null);
    loadSpecs(p.id);
  }

  function loadSpecs(cpId: number) {
    api<ProductSpec[]>(`/api/v1/catalog-products/${cpId}/specifications`).then(setProductSpecs).catch(() => {});
    api<SpecCatalogEntry[]>("/api/v1/catalog-products/specifications/catalog").then(setSpecCatalog).catch(() => {});
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      if (creating) {
        const created = await api<CatalogProduct>("/api/v1/catalog-products", {
          method: "POST", json: form,
        });
        setCreating(false);
        setSelected(created);
        setTab("details");
        loadSpecs(created.id);
      } else if (selected) {
        const updated = await api<CatalogProduct>(`/api/v1/catalog-products/${selected.id}`, {
          method: "PATCH", json: form,
        });
        setSelected(updated);
      }
      load();
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!selected || !confirm(`Delete "${selected.model_name}"?`)) return;
    try {
      await api(`/api/v1/catalog-products/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      load();
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  }

  async function saveSpecs() {
    if (!selected) return;
    setSavingSpecs(true);
    try {
      const ids = productSpecs.map(s => s.specification_id);
      const updated = await api<ProductSpec[]>(`/api/v1/catalog-products/${selected.id}/specifications`, {
        method: "PUT", json: { specification_ids: ids },
      });
      setProductSpecs(updated);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSavingSpecs(false);
    }
  }

  async function createSpec() {
    if (!newSpecName.trim()) return;
    setCreatingSpec(true);
    try {
      await api("/api/v1/catalog-products/specifications/catalog", {
        method: "POST", json: { name: newSpecName.trim() },
      });
      setNewSpecName("");
      api<SpecCatalogEntry[]>("/api/v1/catalog-products/specifications/catalog").then(setSpecCatalog).catch(() => {});
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setCreatingSpec(false);
    }
  }

  function toggleSpec(specId: number, specName: string) {
    const has = productSpecs.some(s => s.specification_id === specId);
    if (has) {
      setProductSpecs(prev => prev.filter(s => s.specification_id !== specId));
    } else {
      setProductSpecs(prev => [
        ...prev,
        { id: 0, specification_id: specId, spec_name: specName, display_order: prev.length },
      ]);
    }
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const filteredSpecCatalog = specCatalog.filter(s =>
    !specSearch.trim() || s.name.toLowerCase().includes(specSearch.toLowerCase())
  );

  const panelOpen = !!selected || creating;

  return (
    <div className="flex h-full gap-6">
      {/* ── List ── */}
      <div className={`flex flex-col gap-4 ${panelOpen ? "w-1/2" : "w-full"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Product Catalog</h1>
            <p className="text-xs text-slate-500">{total} products</p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
          >
            + Add product
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or code…"
            className="flex-1 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:border-accent/60"
          />
          <select
            value={filterCat}
            onChange={e => { setFilterCat(e.target.value); setPage(1); }}
            className="rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-sm text-white outline-none focus:border-accent/60"
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {err && <p className="rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">{err}</p>}

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-card text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Model Name</th>
                <th className="px-4 py-2.5 text-left">Code</th>
                <th className="px-4 py-2.5 text-left">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {products.map(p => (
                <tr
                  key={p.id}
                  onClick={() => openEdit(p)}
                  className={`cursor-pointer hover:bg-white/5 ${selected?.id === p.id ? "bg-accent/10" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium text-white">{p.model_name}</td>
                  <td className="px-4 py-2.5 text-slate-400">{p.code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.category ?? "—"}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No products found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="disabled:opacity-40 hover:text-white">← Prev</button>
            <span>Page {page} of {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
              className="disabled:opacity-40 hover:text-white">Next →</button>
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {panelOpen && (
        <div className="flex w-1/2 flex-col gap-4 rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {creating ? "New product" : selected?.model_name}
            </h2>
            <button onClick={() => { setSelected(null); setCreating(false); }}
              className="text-slate-500 hover:text-white">✕</button>
          </div>

          {/* Tabs (only when editing existing) */}
          {!creating && (
            <div className="flex gap-1 border-b border-surface-border pb-2">
              {(["details", "specs"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 text-xs rounded-md ${tab === t ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-white"}`}>
                  {t === "details" ? "Details" : "Specifications"}
                </button>
              ))}
            </div>
          )}

          {/* Details form */}
          {(creating || tab === "details") && (
            <div className="flex flex-col gap-3 overflow-auto">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Model Name *</span>
                <input value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                  className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-sm text-white outline-none focus:border-accent/60" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Code</span>
                <input value={form.code ?? ""} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-sm text-white outline-none focus:border-accent/60" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Category</span>
                <input value={form.category ?? ""} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  list="cat-list"
                  className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-sm text-white outline-none focus:border-accent/60" />
                <datalist id="cat-list">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Definition</span>
                <textarea rows={5} value={form.definition ?? ""} onChange={e => setForm(f => ({ ...f, definition: e.target.value }))}
                  className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-sm text-white outline-none focus:border-accent/60 resize-none" />
              </label>

              {err && <p className="text-xs text-red-400">{err}</p>}

              <div className="flex gap-2">
                <button onClick={save} disabled={saving || !form.model_name.trim()}
                  className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-accent/80">
                  {saving ? "Saving…" : creating ? "Create" : "Save changes"}
                </button>
                {!creating && (
                  <button onClick={del}
                    className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30">
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Specs tab */}
          {!creating && tab === "specs" && (
            <div className="flex flex-col gap-3 overflow-auto">
              <p className="text-xs text-slate-500">
                Choose which specifications appear as fillable fields on offer line items for this product.
              </p>

              {/* Current specs */}
              {productSpecs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {productSpecs.map(s => (
                    <span key={s.specification_id}
                      className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                      {s.spec_name}
                      <button onClick={() => toggleSpec(s.specification_id, s.spec_name)}
                        className="hover:text-red-400">✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search & add from catalog */}
              <input value={specSearch} onChange={e => setSpecSearch(e.target.value)}
                placeholder="Search specifications…"
                className="rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-xs text-white outline-none focus:border-accent/60" />

              <div className="max-h-48 overflow-auto rounded-lg border border-surface-border divide-y divide-surface-border">
                {filteredSpecCatalog.map(s => {
                  const active = productSpecs.some(ps => ps.specification_id === s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSpec(s.id, s.name)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-white/5 ${active ? "text-accent" : "text-slate-300"}`}>
                      <span>{s.name}</span>
                      {active && <span className="text-accent">✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Create new spec */}
              <div className="flex gap-2">
                <input value={newSpecName} onChange={e => setNewSpecName(e.target.value)}
                  placeholder="New specification name…"
                  className="flex-1 rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-xs text-white outline-none focus:border-accent/60" />
                <button onClick={createSpec} disabled={creatingSpec || !newSpecName.trim()}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-40">
                  {creatingSpec ? "Adding…" : "+ New"}
                </button>
              </div>

              {err && <p className="text-xs text-red-400">{err}</p>}

              <button onClick={saveSpecs} disabled={savingSpecs}
                className="rounded-lg bg-accent py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-accent/80">
                {savingSpecs ? "Saving…" : "Save specifications"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
