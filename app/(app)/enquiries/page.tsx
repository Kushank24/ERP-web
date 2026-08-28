"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSortedData } from "@/lib/useSortedData";
import { SortHeader } from "@/components/SortHeader";
import { ProductCombobox, CatalogProduct } from "@/components/ProductCombobox";

interface Company { id: number; name: string; }
interface EnquiryItem { id?: number; product_name: string | null; quantity: number; specifications: string | null; }
interface EnquiryRow {
  id: number; enquiry_number: string; company_name: string | null; company_id: number | null;
  enquiry_date: string; status: string; priority: string; notes: string | null; reference_number: string | null;
}
interface EnquiryDetail extends EnquiryRow { items: EnquiryItem[]; }
type DraftItem = { product_id: number | null; product_name: string; quantity: number; specifications: string; };
const BLANK_ITEM: DraftItem = { product_id: null, product_name: "", quantity: 1, specifications: "" };
const BLANK_FORM = {
  company_id: "" as string | number,
  enquiry_date: new Date().toISOString().slice(0, 10),
  status: "pending", priority: "medium", notes: "", reference_number: "",
  items: [] as DraftItem[],
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  offer_sent: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  completed: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};
const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>{status.replace(/_/g, " ")}</span>;
}
function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{priority}</span>;
}
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-border/40 ${className}`} />;
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

export default function EnquiriesPage() {
  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowOffset, setRowOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchFirstRun = useRef(true);
  const filterFirstRun = useRef(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EnquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchPage = useCallback((q: string, status: string, off: number, append: boolean) => {
    if (!append) setListLoading(true); else setLoadingMore(true);
    setListError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ data: EnquiryRow[]; total: number }>(`/api/v1/enquiries?${params}`)
      .then(res => {
        setRows(prev => append ? [...prev, ...res.data] : res.data);
        setTotal(res.total);
        setRowOffset(off + res.data.length);
        setListLoading(false); setLoadingMore(false);
      })
      .catch((e: Error) => { setListError(e.message); setListLoading(false); setLoadingMore(false); });
  }, []);

  const loadList = useCallback(() => {
    fetchPage(searchText, filterStatus, 0, false);
  }, [fetchPage, searchText, filterStatus]);

  useEffect(() => {
    fetchPage("", "", 0, false);
    api<{ data: Company[]; total: number }>("/api/v1/companies?limit=2000")
      .then(res => setCompanies(res.data)).catch(() => {});
  }, []);

  // Debounce search → server (skip initial mount — mount effect already fetched)
  useEffect(() => {
    if (searchFirstRun.current) { searchFirstRun.current = false; return; }
    const t = setTimeout(() => { setSearchText(searchInput); fetchPage(searchInput, filterStatus, 0, false); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Status filter → server (skip initial mount)
  useEffect(() => {
    if (filterFirstRun.current) { filterFirstRun.current = false; return; }
    fetchPage(searchText, filterStatus, 0, false);
  }, [filterStatus]);

  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    api<EnquiryDetail>(`/api/v1/enquiries/${id}`)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch((e: Error) => { setDetailError(e.message); setDetailLoading(false); });
  }, []);

  function handleRowClick(id: number) {
    setSelectedId(id); setShowForm(false); setSaveError(null); loadDetail(id);
  }

  function openNew() {
    setIsEditing(false); setForm(BLANK_FORM); setSaveError(null);
    setShowForm(true); setSelectedId(null); setDetail(null);
  }

  function startEdit() {
    if (!detail) return;
    setForm({
      company_id: detail.company_id ?? "",
      enquiry_date: detail.enquiry_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: detail.status, priority: detail.priority,
      notes: detail.notes || "", reference_number: detail.reference_number || "",
      items: (detail.items ?? []).map(i => ({ product_id: null, product_name: i.product_name || "", quantity: i.quantity, specifications: i.specifications || "" })),
    });
    setIsEditing(true); setSaveError(null); setShowForm(true);
  }

  function closePanel() {
    setShowForm(false); setIsEditing(false); setSelectedId(null); setDetail(null); setSaveError(null);
  }

  function closeForm() {
    setShowForm(false); setIsEditing(false); setSaveError(null);
    if (selectedId !== null) loadDetail(selectedId);
  }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] })); }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }
  function updateItem(idx: number, field: keyof DraftItem, value: string | number) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        company_id: form.company_id ? Number(form.company_id) : null,
        enquiry_date: form.enquiry_date, status: form.status, priority: form.priority,
        notes: form.notes || null, reference_number: form.reference_number || null,
        items: form.items.map(i => ({ product_id: i.product_id || null, product_name: i.product_name || null, quantity: Number(i.quantity), specifications: i.specifications || null })),
      };
      let saved: EnquiryDetail;
      if (isEditing && selectedId) {
        saved = await api<EnquiryDetail>(`/api/v1/enquiries/${selectedId}`, { method: "PUT", json: payload });
      } else {
        saved = await api<EnquiryDetail>("/api/v1/enquiries", { method: "POST", json: payload });
      }
      setShowForm(false); setIsEditing(false);
      setSelectedId(saved.id); setDetail(saved); loadList();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!detail) return;
    if (!confirm(`Delete enquiry ${detail.enquiry_number}?`)) return;
    try {
      await api(`/api/v1/enquiries/${detail.id}`, { method: "DELETE" });
      closePanel(); loadList();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Delete failed"); }
  }

  const panelOpen = showForm || selectedId !== null;
  const { sorted: filteredRows, sortKey: enqSortKey, sortDir: enqSortDir, toggleSort: toggleEnqSort } =
    useSortedData(rows, "enquiry_number" as keyof EnquiryRow);
  const hasMore = rows.length < total;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 gap-5">

      {/* ── LEFT: LIST ── */}
      <div className={`flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out ${panelOpen ? "w-[38%]" : "w-full"}`}>

        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Enquiries</h2>
            <p className="text-[11px] text-slate-500">
              {listLoading ? "Loading…" : `${rows.length} of ${total} enquir${total !== 1 ? "ies" : "y"}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadList} disabled={listLoading} title="Refresh"
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-40">
              <span className={`inline-block ${listLoading ? "animate-spin" : ""}`}>↻</span> Refresh
            </button>
            <button onClick={openNew}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20">
              + New
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2 flex gap-2">
          <input type="search" placeholder="Search…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="flex-1 rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none focus:border-accent/50" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-accent/50">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="offer_sent">Offer Sent</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <SortHeader label="Enquiry #" colKey="enquiry_number" currentKey={enqSortKey as string} currentDir={enqSortDir} onSort={k => toggleEnqSort(k as keyof EnquiryRow)} />
            <SortHeader label="Company" colKey="company_name" currentKey={enqSortKey as string} currentDir={enqSortDir} onSort={k => toggleEnqSort(k as keyof EnquiryRow)} />
            <SortHeader label="Status" colKey="status" currentKey={enqSortKey as string} currentDir={enqSortDir} onSort={k => toggleEnqSort(k as keyof EnquiryRow)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-3">
                  <Skeleton className="h-3.5 w-24" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : listError ? (
            <div className="p-4"><ErrorAlert message={listError} /></div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {filterStatus || searchInput ? "No enquiries match the filter." : "No enquiries yet. Click + New to add one."}
            </div>
          ) : (
            <>
            <ul>
              {filteredRows.map(row => {
                const isActive = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button type="button" onClick={() => handleRowClick(row.id)}
                      className={`w-full border-b border-surface-border/30 px-4 py-3 text-left last:border-b-0 transition-colors ${isActive ? "border-l-2 border-l-accent bg-accent/10" : "hover:bg-white/[0.025]"}`}>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                        <span className={`truncate text-xs font-semibold ${isActive ? "text-accent" : "text-white"}`}>{row.enquiry_number}</span>
                        <span className="truncate text-xs text-slate-400">{row.company_name || "—"}</span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-600">
                        <span>{fmtDate(row.enquiry_date)}</span>
                        <PriorityBadge priority={row.priority} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="border-t border-surface-border/30 p-3">
                <button onClick={() => fetchPage(searchText, filterStatus, rowOffset, true)} disabled={loadingMore}
                  className="w-full rounded-lg border border-surface-border/60 py-2 text-xs text-slate-400 hover:border-accent/40 hover:text-accent disabled:opacity-50">
                  {loadingMore ? "Loading…" : `Load more (${total - rows.length} remaining)`}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: DETAIL / FORM ── */}
      {panelOpen && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">

          <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {showForm ? (isEditing ? "Edit Enquiry" : "New Enquiry") : "Enquiry Detail"}
              </h2>
              {!showForm && detail && (
                <p className="text-[11px] text-slate-500">{detail.enquiry_number} · {fmtDate(detail.enquiry_date)}</p>
              )}
            </div>
            <button type="button" onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white" title="Close">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── FORM ── */}
            {showForm && (
              <form onSubmit={handleSave} className="space-y-6 p-6">
                {saveError && <ErrorAlert message={saveError} />}

                <section>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Enquiry Details</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs text-slate-400">Company</label>
                      <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="">— No company —</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Enquiry Date</label>
                      <input type="date" value={form.enquiry_date} onChange={e => setForm(f => ({ ...f, enquiry_date: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white [color-scheme:dark] outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Reference #</label>
                      <input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                        placeholder="PO-123 / RFQ-456"
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="offer_sent">Offer Sent</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Priority</label>
                      <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs text-slate-400">Notes</label>
                      <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Items <span className="ml-1 rounded-full bg-surface-border px-1.5 py-0.5 text-[10px] font-normal text-slate-400">{form.items.length}</span>
                    </p>
                    <button type="button" onClick={addItem}
                      className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:border-accent hover:text-accent">
                      + Add Item
                    </button>
                  </div>
                  {form.items.map((it, idx) => (
                    <div key={idx} className="mb-2 rounded-lg border border-surface-border/60 bg-[#0f1419] p-3">
                      <div className="grid grid-cols-[1fr_5rem_auto] gap-2 mb-2">
                        <ProductCombobox
                          hasSpecs
                          value={it.product_id ? { id: it.product_id, name: it.product_name } : null}
                          onSelect={(p: CatalogProduct | null) => setForm(f => ({
                            ...f,
                            items: f.items.map((x, i) => i === idx ? {
                              ...x,
                              product_id: p ? p.id : null,
                              product_name: p ? p.model_name : "",
                            } : x),
                          }))}
                        />
                        <input type="number" min={1} value={it.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} placeholder="Qty"
                          className="rounded border border-surface-border/60 bg-transparent px-2 py-1.5 text-xs text-white outline-none focus:border-accent/60 focus:bg-[#0b0f14]" />
                        <button type="button" onClick={() => removeItem(idx)} className="rounded p-1.5 text-slate-600 hover:text-red-400">✕</button>
                      </div>
                      <input value={it.product_name} onChange={e => updateItem(idx, "product_name", e.target.value)} placeholder="Product name (editable)"
                        className="mb-1.5 w-full rounded border border-surface-border/50 bg-[#0b0f14] px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-accent/60" />
                      <input value={it.specifications} onChange={e => updateItem(idx, "specifications", e.target.value)} placeholder="Specifications (optional)"
                        className="w-full rounded border border-surface-border/60 bg-transparent px-2 py-1.5 text-xs text-slate-400 placeholder-slate-600 outline-none focus:border-accent/60 focus:bg-[#0b0f14] focus:text-white" />
                    </div>
                  ))}
                </section>

                <div className="flex items-center justify-end gap-3 pb-1">
                  <button type="button" onClick={closeForm}
                    className="rounded-lg border border-surface-border px-5 py-2 text-sm text-slate-400 hover:text-white">
                    Cancel
                  </button>
                  {isEditing && (
                    <button type="button" onClick={handleDelete}
                      className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                      Delete
                    </button>
                  )}
                  <button type="submit" disabled={saving}
                    className="flex min-w-[9rem] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                    {saving ? (
                      <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> Saving…</>
                    ) : isEditing ? "Update" : "Create Enquiry"}
                  </button>
                </div>
              </form>
            )}

            {/* ── DETAIL ── */}
            {!showForm && selectedId !== null && (
              <div className="space-y-5 p-6">
                {detailError && <ErrorAlert message={detailError} />}
                {detailLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-40 rounded-xl" />
                  </div>
                ) : detail ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">{detail.enquiry_number}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{fmtDate(detail.enquiry_date)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={detail.status} />
                        <button type="button" onClick={startEdit}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-400 hover:text-white">
                          Edit
                        </button>
                        <Link
                          href={`/offers?enquiry_id=${detail.id}&company_id=${detail.company_id ?? ""}`}
                          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20">
                          Create Offer
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Details</p>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <div>
                          <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Company</p>
                          <p className="text-sm font-medium text-white">{detail.company_name || "—"}</p>
                        </div>
                        <div>
                          <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Priority</p>
                          <PriorityBadge priority={detail.priority} />
                        </div>
                        {detail.reference_number && (
                          <div className="col-span-2">
                            <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Reference #</p>
                            <p className="text-sm font-medium text-white">{detail.reference_number}</p>
                          </div>
                        )}
                      </div>
                      {detail.notes && (
                        <div className="mt-3 border-t border-surface-border/50 pt-3">
                          <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Notes</p>
                          <p className="text-sm leading-relaxed text-slate-300">{detail.notes}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Items <span className="ml-1 rounded-full bg-surface-border px-1.5 py-0.5 font-normal text-slate-400">{(detail.items ?? []).length}</span>
                      </p>
                      {(detail.items ?? []).length === 0 ? (
                        <p className="text-sm text-slate-600">No items on this enquiry.</p>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-surface-border">
                          <table className="w-full text-sm">
                            <thead className="border-b border-surface-border bg-[#0f1419]/80">
                              <tr>
                                {["Product / Description", "Qty", "Specifications"].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(detail.items ?? []).map((it, i) => (
                                <tr key={i} className={`border-t border-surface-border/40 ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}>
                                  <td className="px-3 py-2.5 text-xs font-medium text-white">{it.product_name || "—"}</td>
                                  <td className="px-3 py-2.5 text-xs text-slate-300">{it.quantity}</td>
                                  <td className="px-3 py-2.5 text-xs text-slate-400">{it.specifications || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
