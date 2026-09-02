"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useSortedData } from "@/lib/useSortedData";
import { SortHeader } from "@/components/SortHeader";

interface Company {
  id: number; name: string; contact_person: string | null; email: string | null;
  phone: string | null; address: string | null; gstin: string | null; created_at: string;
}

const EMPTY = { name: "", contact_person: "", email: "", phone: "", address: "", gstin: "" };

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"animate-pulse rounded bg-surface-border/40 " + className} />;
}
function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-400">
      <span className="mt-px shrink-0 text-base leading-none">⚠</span>
      <span className="leading-snug">{message}</span>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchPage = useCallback((q: string, off: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setListError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
    if (q) params.set("q", q);
    api<{ data: Company[]; total: number }>(`/api/v1/companies?${params}`)
      .then(res => {
        setCompanies(prev => append ? [...prev, ...res.data] : res.data);
        setTotal(res.total);
        setOffset(off + res.data.length);
        setLoading(false); setLoadingMore(false);
      })
      .catch((e: Error) => { setListError(e.message); setLoading(false); setLoadingMore(false); });
  }, []);

  const load = useCallback(() => { fetchPage(search, 0, false); }, [fetchPage, search]);

  useEffect(() => { fetchPage("", 0, false); }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); fetchPage(searchInput, 0, false); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleRowClick(c: Company) {
    setSelectedId(c.id);
    setForm({ name: c.name, contact_person: c.contact_person || "", email: c.email || "", phone: c.phone || "", address: c.address || "", gstin: c.gstin || "" });
    setIsNew(false); setShowForm(true); setSaveError(null);
  }

  function openNew() {
    setSelectedId(null); setForm(EMPTY); setIsNew(true); setShowForm(true); setSaveError(null);
  }

  function closePanel() {
    setShowForm(false); setSelectedId(null); setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setSaveError("Company name is required"); return; }
    setSaving(true); setSaveError(null);
    try {
      if (isNew) {
        await api("/api/v1/companies", { method: "POST", json: form });
      } else if (selectedId) {
        await api("/api/v1/companies/" + selectedId, { method: "PUT", json: form });
      }
      closePanel(); load();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selectedId) return;
    const c = companies.find(x => x.id === selectedId);
    if (!confirm("Delete \"" + (c?.name || "this company") + "\"? This cannot be undone.")) return;
    try {
      await api("/api/v1/companies/" + selectedId, { method: "DELETE" });
      closePanel(); load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Delete failed"); }
  }

  const panelOpen = showForm;
  const { sorted: filtered, sortKey: coSortKey, sortDir: coSortDir, toggleSort: toggleCoSort } =
    useSortedData<Company>(companies, "name");
  const hasMore = companies.length < total;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          fetchPage(search, offset, true);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, fetchPage, search, offset]);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 gap-5">

      <div className={"flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out " + (panelOpen ? "w-[38%]" : "w-full")}>

        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Companies</h2>
            <p className="text-[11px] text-slate-500">
              {loading ? "Loading…" : `${companies.length} of ${total} compan${total !== 1 ? "ies" : "y"}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-[11px] text-slate-400 hover:border-slate-500 hover:text-white disabled:opacity-40">
              <span className={"inline-block " + (loading ? "animate-spin" : "")}>↻</span> Refresh
            </button>
            <button onClick={openNew}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20">
              + New
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <input type="search" placeholder="Search companies…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none focus:border-accent/50" />
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <SortHeader label="Company" colKey="name" currentKey={coSortKey as string} currentDir={coSortDir} onSort={k => toggleCoSort(k as keyof Company)} />
            <SortHeader label="Contact" colKey="contact_person" currentKey={coSortKey as string} currentDir={coSortDir} onSort={k => toggleCoSort(k as keyof Company)} />
            <SortHeader label="Email" colKey="email" currentKey={coSortKey as string} currentDir={coSortDir} onSort={k => toggleCoSort(k as keyof Company)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-3">
                  <Skeleton className="h-3.5 w-32" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-3.5 w-36" />
                </div>
              ))}
            </div>
          ) : listError ? (
            <div className="p-4"><ErrorAlert message={listError} /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {searchInput ? "No companies match." : "No companies yet. Click + New to add one."}
            </div>
          ) : (
            <>
              <ul>
                {filtered.map(c => {
                  const isActive = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => handleRowClick(c)}
                        className={"w-full border-b border-surface-border/30 px-4 py-3 text-left last:border-b-0 transition-colors " + (isActive ? "border-l-2 border-l-accent bg-accent/10" : "hover:bg-white/[0.025]")}>
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                          <span className={"truncate text-xs font-semibold " + (isActive ? "text-accent" : "text-white")}>{c.name}</span>
                          <span className="truncate text-xs text-slate-400">{c.contact_person || "—"}</span>
                          <span className="truncate text-xs text-slate-400">{c.email || "—"}</span>
                        </div>
                        {c.gstin && <div className="mt-0.5 font-mono text-[10px] text-slate-600">{c.gstin}</div>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div ref={sentinelRef} className="py-4 text-center text-xs text-slate-500">
                  {loadingMore ? "Loading…" : ""}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {panelOpen && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">

          <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">{isNew ? "Add Company" : "Edit Company"}</h2>
              {!isNew && form.name && <p className="text-[11px] text-slate-500">{form.name}</p>}
            </div>
            <button type="button" onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSave} className="space-y-5 p-6">
              {saveError && <ErrorAlert message={saveError} />}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">Company Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Acme Pvt Ltd"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Contact Person</label>
                  <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Rahul Sharma"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@acme.com"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">GSTIN</label>
                  <input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="27AAAAA0000A1Z5"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 font-mono text-sm text-white outline-none focus:border-accent/70" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">Address</label>
                  <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={3} placeholder="123 MG Road, Mumbai, MH 400001"
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={closePanel}
                  className="rounded-lg border border-surface-border px-5 py-2 text-sm text-slate-400 hover:text-white">
                  Cancel
                </button>
                {!isNew && (
                  <button type="button" onClick={handleDelete}
                    className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                    Delete
                  </button>
                )}
                <button type="submit" disabled={saving}
                  className="flex min-w-[9rem] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {saving
                    ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> Saving…</>
                    : isNew ? "Add Company" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
