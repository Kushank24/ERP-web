"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, apiBlob } from "@/lib/api";
import { useSortedData } from "@/lib/useSortedData";
import { SortHeader } from "@/components/SortHeader";
import { ProductCombobox } from "@/components/ProductCombobox";

interface Company { id: number; name: string; contact_person: string | null; phone: string | null; email: string | null; }
interface Enquiry { id: number; enquiry_number: string; }
interface EnquiryItemRaw { product_id: number | null; product_name: string | null; quantity: number; specifications: string | null; }
interface EnquiryWithItems { id: number; company_id: number | null; items: EnquiryItemRaw[]; }
interface Product { id: number; model_name: string; code: string | null; }
interface SpecSlot { specification_id: number; spec_name: string; display_order: number; }
interface SpecValue { specification_id: number; value: string; }
interface PriceHistory { offer_number: string; offer_date: string; status: string; unit_price: number; quantity: number; }
interface OfferItem {
  id?: number; product_id?: number | null; description: string;
  quantity: number; unit_price: number; total_price?: number;
  specifications?: Array<{ specification_id: number; value: string; spec_name: string; }>;
}
interface OfferRow {
  id: number; offer_number: string; company_name: string | null; enquiry_number: string | null;
  offer_date: string; valid_until: string | null; status: string; total_amount: number; currency: string;
}
interface OfferDetail extends OfferRow {
  company_id: number | null; enquiry_id: number | null;
  packing_charges_pct: number; freight_charges: number; gst_pct: number; subtotal: number;
  terms_conditions: string | null; notes: string | null; sales_order_id: number | null;
  company_gstin: string | null; company_address: string | null; contact_person: string | null;
  company_phone: string | null; company_email: string | null; kind_attn: string | null;
  follow_up_comments: string | null; follow_up_completed: boolean;
  items: OfferItem[];
}

type DraftItem = { product_id: number | null; description: string; quantity: number; unit_price: number; specs: SpecValue[]; };
const BLANK_ITEM: DraftItem = { product_id: null, description: "", quantity: 1, unit_price: 0, specs: [] };
const BLANK_FORM = {
  company_id: "" as string | number, enquiry_id: "" as string | number,
  offer_number: "", offer_date: new Date().toISOString().slice(0, 10),
  valid_until: "", currency: "INR",
  kind_attn: "",
  packing_charges_pct: 0, freight_charges: 0, gst_pct: 18,
  rates_quoted: "Ex-works",
  transportation: "Extra to be paid by Buyer",
  delivery_terms: "As per mutual agreement",
  payment_terms: "As per mutual agreement",
  hsn_code: "70199000",
  conformity_cert: "As per International Standard: (EN-131/ANDI A-14.5)",
  notes: "", items: [] as DraftItem[],
};

function parseTerms(raw: string | null) {
  const m: Record<string, string> = {};
  (raw || "").split("\n").forEach(line => {
    const i = line.indexOf(": ");
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 2).trim();
  });
  return {
    rates_quoted: m["Rates Quoted above are"] || "Ex-works",
    transportation: m["Transportation"] || "Extra to be paid by Buyer",
    delivery_terms: m["Delivery"] || "As per mutual agreement",
    payment_terms: m["Payment"] || "As per mutual agreement",
    hsn_code: m["HSN Code"] || "70199000",
    conformity_cert: m["Conformity Certificate"] || "As per International Standard: (EN-131/ANDI A-14.5)",
  };
}

function buildTerms(f: typeof BLANK_FORM): string {
  return [
    `Rates Quoted above are: ${f.rates_quoted}`,
    `Packing Charges: ${f.packing_charges_pct}%`,
    `GST Extra: ${f.gst_pct}%`,
    `Transportation: ${f.transportation}`,
    `Delivery: ${f.delivery_terms}`,
    `Payment: ${f.payment_terms}`,
    `Freight Charges: Rs. ${Number(f.freight_charges).toFixed(2)}`,
    `Validity of Our Offer: ${f.valid_until || "As per mutual agreement"}`,
    `Manufactured by and Brand: E-SAFE`,
    `Our GST No.: 08AACFE4028Q1Z5`,
    `HSN Code: ${f.hsn_code}`,
    `Conformity Certificate: ${f.conformity_cert}`,
  ].join("\n");
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  accepted: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  expired: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmt(n: number | string) { return "₹" + Number(n).toFixed(2); }

function StatusBadge({ status, offerDate }: { status: string; offerDate?: string }) {
  const cls = STATUS_COLORS[status] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
  let label = status;
  if (status === "sent" && offerDate) {
    const days = Math.floor((Date.now() - new Date(offerDate).getTime()) / 86_400_000);
    label = days > 0 ? `Open · ${days}d` : "Open";
  }
  return <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide " + cls}>{label}</span>;
}
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

export default function OffersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [rows, setRows] = useState<OfferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowOffset, setRowOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [productSpecs, setProductSpecs] = useState<Record<number, SpecSlot[]>>({});
  const specsLoadedRef = useRef<Set<number>>(new Set());
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistory[]>>({});

  const fetchPage = useCallback((q: string, status: string, off: number, append: boolean) => {
    if (!append) setListLoading(true); else setLoadingMore(true);
    setListError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    api<{ data: OfferRow[]; total: number }>(`/api/v1/offers?${params}`)
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

  const autoFilledRef = useRef(false);

  useEffect(() => {
    fetchPage("", "", 0, false);
    api<{ data: Company[]; total: number }>("/api/v1/companies?limit=2000")
      .then(res => setCompanies(res.data)).catch(() => {});
    api<{ data: Enquiry[]; total: number }>("/api/v1/enquiries?limit=2000")
      .then(res => setEnquiries(res.data)).catch(() => {});
  }, []);

  // Auto-open form when navigated from enquiries page with ?enquiry_id=X
  useEffect(() => {
    if (autoFilledRef.current || listLoading) return;
    const eid = searchParams.get("enquiry_id");
    if (!eid) return;
    autoFilledRef.current = true;
    const cid = searchParams.get("company_id");
    router.replace("/offers");
    api<EnquiryWithItems>(`/api/v1/enquiries/${eid}`)
      .then(enq => {
        const draftItems = (enq.items ?? []).map(i => ({
          product_id: i.product_id ?? null,
          description: i.product_name || "",
          quantity: i.quantity,
          unit_price: 0,
          specs: [] as SpecValue[],
        }));
        setForm({
          ...BLANK_FORM,
          offer_number: suggestOfferNumber(),
          enquiry_id: Number(eid),
          company_id: enq.company_id ?? (cid && cid !== "" ? Number(cid) : ""),
          items: draftItems,
        });
        setIsEditing(false);
        setSaveError(null);
        setShowForm(true);
        setSelectedId(null);
        setDetail(null);
        // Pre-load specs for products that have them
        (enq.items ?? []).forEach(i => { if (i.product_id) loadProductSpecs(i.product_id); });
      })
      .catch(() => {
        setForm({
          ...BLANK_FORM,
          offer_number: suggestOfferNumber(),
          enquiry_id: Number(eid),
          company_id: cid && cid !== "" ? Number(cid) : "",
        });
        setIsEditing(false);
        setSaveError(null);
        setShowForm(true);
        setSelectedId(null);
        setDetail(null);
      });
  }, [listLoading, searchParams, router]);

  // Auto-open a specific offer when navigated from analytics with ?id=N
  useEffect(() => {
    if (listLoading) return;
    const id = searchParams.get("id");
    if (!id) return;
    router.replace("/offers");
    setSelectedId(Number(id));
    loadDetail(Number(id));
  }, [listLoading, searchParams, router]);

  // Debounce search → server
  useEffect(() => {
    const t = setTimeout(() => { setSearchText(searchInput); fetchPage(searchInput, filterStatus, 0, false); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Status filter → server
  useEffect(() => {
    fetchPage(searchText, filterStatus, 0, false);
  }, [filterStatus]);

  // Date filter → server
  useEffect(() => {
    fetchPage(searchText, filterStatus, 0, false);
  }, [dateFrom, dateTo]);

  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true); setDetailError(null); setDetail(null);
    api<OfferDetail>("/api/v1/offers/" + id)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch((e: Error) => { setDetailError(e.message); setDetailLoading(false); });
  }, []);

  function handleRowClick(id: number) {
    setSelectedId(id); setShowForm(false); setSaveError(null); loadDetail(id);
  }

  function suggestOfferNumber() {
    const year = new Date().getFullYear();
    const seq = (rows.filter(o => o.offer_number.startsWith("OFF-" + year)).length + 1).toString().padStart(4, "0");
    return "OFF-" + year + "-" + seq;
  }

  function openNew() {
    setIsEditing(false); setForm({ ...BLANK_FORM, offer_number: suggestOfferNumber() });
    setSaveError(null); setShowForm(true); setSelectedId(null); setDetail(null);
  }

  function startEdit() {
    if (!detail) return;
    setForm({
      company_id: detail.company_id ?? "", enquiry_id: detail.enquiry_id ?? "",
      offer_number: detail.offer_number,
      offer_date: detail.offer_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      valid_until: detail.valid_until?.slice(0, 10) || "",
      currency: detail.currency,
      kind_attn: detail.kind_attn || detail.contact_person || "",
      packing_charges_pct: Number(detail.packing_charges_pct),
      freight_charges: Number(detail.freight_charges),
      gst_pct: Number(detail.gst_pct),
      ...parseTerms(detail.terms_conditions),
      notes: detail.notes || "",
      items: (detail.items ?? []).map(i => ({
        product_id: i.product_id ?? null,
        description: i.description,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        specs: (i.specifications ?? []).map(s => ({ specification_id: s.specification_id, value: s.value })),
      })),
    });
    setIsEditing(true); setSaveError(null); setShowForm(true);
    (detail.items ?? []).forEach(i => { if (i.product_id) loadProductSpecs(i.product_id); });
  }

  function closePanel() {
    setShowForm(false); setIsEditing(false); setSelectedId(null); setDetail(null); setSaveError(null);
  }

  function closeForm() {
    setShowForm(false); setIsEditing(false); setSaveError(null);
    if (selectedId !== null) loadDetail(selectedId);
  }

  function loadProductSpecs(productId: number) {
    if (specsLoadedRef.current.has(productId)) return;
    specsLoadedRef.current.add(productId);
    api<SpecSlot[]>("/api/v1/catalog-products/" + productId + "/specifications")
      .then(slots => setProductSpecs(prev => ({ ...prev, [productId]: slots })))
      .catch(() => specsLoadedRef.current.delete(productId));
  }

  function loadPriceHistory(companyId: number, productId: number) {
    const key = `${companyId}_${productId}`;
    if (priceHistory[key]) return;
    api<PriceHistory[]>(`/api/v1/offers/price-history?company_id=${companyId}&product_id=${productId}`)
      .then(rows => setPriceHistory(prev => ({ ...prev, [key]: rows })))
      .catch(() => {});
  }

  function handleProductSelect(idx: number, product: Product | null) {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? {
        ...it,
        product_id: product ? product.id : null,
        description: product ? product.model_name : "",
        unit_price: it.unit_price,
        specs: [],
      } : it),
    }));
    if (product) {
      loadProductSpecs(product.id);
      if (form.company_id) loadPriceHistory(Number(form.company_id), product.id);
    }
  }

  function updateSpec(idx: number, specificationId: number, value: string) {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => {
        if (i !== idx) return it;
        const hasSpec = it.specs.some(s => s.specification_id === specificationId);
        const newSpecs = hasSpec
          ? it.specs.map(s => s.specification_id === specificationId ? { ...s, value } : s)
          : [...it.specs, { specification_id: specificationId, value }];
        return { ...it, specs: newSpecs };
      }),
    }));
  }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] })); }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }
  function updateItem(idx: number, field: keyof DraftItem, value: string | number) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  }

  function calcTotals() {
    const subtotal = form.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const packing = subtotal * (Number(form.packing_charges_pct) / 100);
    const assessable = subtotal + packing + Number(form.freight_charges);
    const gst = assessable * (Number(form.gst_pct) / 100);
    return { subtotal, total: assessable + gst };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.offer_number.trim()) { setSaveError("Offer number is required"); return; }
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        company_id: form.company_id ? Number(form.company_id) : null,
        enquiry_id: form.enquiry_id ? Number(form.enquiry_id) : null,
        offer_number: form.offer_number.trim(),
        offer_date: form.offer_date, valid_until: form.valid_until || null,
        currency: form.currency,
        kind_attn: form.kind_attn || null,
        packing_charges_pct: Number(form.packing_charges_pct),
        freight_charges: Number(form.freight_charges),
        gst_pct: Number(form.gst_pct),
        terms_conditions: buildTerms(form),
        notes: form.notes || null,
        items: form.items.map(i => ({
          product_id: i.product_id || null,
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          specifications: i.specs.filter(s => s.value.trim()).map(s => ({
            specification_id: s.specification_id,
            value: s.value,
          })),
        })),
      };
      let saved: OfferDetail;
      if (isEditing && selectedId) {
        saved = await api<OfferDetail>("/api/v1/offers/" + selectedId, { method: "PUT", json: payload });
      } else {
        saved = await api<OfferDetail>("/api/v1/offers", { method: "POST", json: payload });
      }
      setShowForm(false); setIsEditing(false);
      setSelectedId(saved.id); setDetail(saved); loadList();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleStatusChange(newStatus: string) {
    if (!detail) return;
    if (!confirm("Mark offer " + detail.offer_number + " as \"" + newStatus + "\"?")) return;
    try {
      const updated = await api<OfferDetail>("/api/v1/offers/" + detail.id + "/status", { method: "PATCH", json: { status: newStatus } });
      setDetail(updated);
      setRows(prev => prev.map(r => r.id === updated.id ? { ...r, status: updated.status } : r));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDownload() {
    if (!detail) return;
    setDownloading(true);
    try {
      const { blob } = await apiBlob("/api/v1/offers/" + detail.id + "/pdf");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Offer-" + detail.offer_number + ".pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Download failed");
    } finally { setDownloading(false); }
  }

  async function handleDelete() {
    if (!detail) return;
    if (!confirm("Delete offer " + detail.offer_number + "?")) return;
    try {
      await api("/api/v1/offers/" + detail.id, { method: "DELETE" });
      closePanel(); loadList();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Delete failed"); }
  }

  const panelOpen = showForm || selectedId !== null;
  const { sorted: filteredRows, sortKey: offerSortKey, sortDir: offerSortDir, toggleSort: toggleOfferSort } =
    useSortedData<OfferRow>(rows, "offer_date", "desc");
  const hasMore = rows.length < total;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          fetchPage(searchText, filterStatus, rowOffset, true);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, fetchPage, searchText, filterStatus, rowOffset]);

  const { subtotal: fSubtotal, total: fTotal } = calcTotals();

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 gap-5">

      <div className={"flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out " + (panelOpen ? "w-[38%]" : "w-full")}>

        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Offers & Quotations</h2>
            <p className="text-[11px] text-slate-500">
              {listLoading ? "Loading…" : `${rows.length} of ${total} offer${total !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadList} disabled={listLoading}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-[11px] text-slate-400 hover:border-slate-500 hover:text-white disabled:opacity-40">
              <span className={"inline-block " + (listLoading ? "animate-spin" : "")}>↻</span> Refresh
            </button>
            <button onClick={openNew}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20">
              + New
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2 space-y-1.5">
          <div className="flex gap-2">
            <input type="search" placeholder="Search…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className="flex-1 rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none focus:border-accent/50" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-accent/50">
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="sent">Open</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Date:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="cursor-pointer rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-0.5 text-[11px] text-slate-300 outline-none focus:border-accent/50 [color-scheme:dark]" />
            <span className="text-[10px] text-slate-600">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="cursor-pointer rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-0.5 text-[11px] text-slate-300 outline-none focus:border-accent/50 [color-scheme:dark]" />
            {(dateFrom || dateTo) && (
              <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[10px] text-slate-500 hover:text-white">✕ Clear</button>
            )}
          </div>
        </div>

        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem_6rem_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <SortHeader label="Offer #" colKey="offer_number" currentKey={offerSortKey as string} currentDir={offerSortDir} onSort={k => toggleOfferSort(k as keyof OfferRow)} />
            <SortHeader label="Company" colKey="company_name" currentKey={offerSortKey as string} currentDir={offerSortDir} onSort={k => toggleOfferSort(k as keyof OfferRow)} />
            <SortHeader label="Date" colKey="offer_date" currentKey={offerSortKey as string} currentDir={offerSortDir} onSort={k => toggleOfferSort(k as keyof OfferRow)} />
            <SortHeader label="Amount" colKey="total_amount" currentKey={offerSortKey as string} currentDir={offerSortDir} onSort={k => toggleOfferSort(k as keyof OfferRow)} className="justify-end" />
            <SortHeader label="Status" colKey="status" currentKey={offerSortKey as string} currentDir={offerSortDir} onSort={k => toggleOfferSort(k as keyof OfferRow)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-3">
                  <Skeleton className="h-3.5 w-24" /><Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-16" /><Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : listError ? (
            <div className="p-4"><ErrorAlert message={listError} /></div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {filterStatus || searchInput ? "No offers match the filter." : "No offers yet. Click + New to add one."}
            </div>
          ) : (
            <>
            <ul>
              {filteredRows.map(row => {
                const isActive = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button type="button" onClick={() => handleRowClick(row.id)}
                      className={"w-full border-b border-surface-border/30 px-4 py-3 text-left last:border-b-0 transition-colors " + (isActive ? "border-l-2 border-l-accent bg-accent/10" : "hover:bg-white/[0.025]")}>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem_6rem_auto] items-center gap-2">
                        <span className={"truncate text-xs font-semibold " + (isActive ? "text-accent" : "text-white")}>{row.offer_number}</span>
                        <span className="truncate text-xs text-slate-400">{row.company_name || "—"}</span>
                        <span className="text-xs text-slate-400">{fmtDate(row.offer_date)}</span>
                        <span className="text-right font-mono text-xs text-slate-300">{fmt(row.total_amount)}</span>
                        <StatusBadge status={row.status} offerDate={row.offer_date} />
                      </div>
                      {row.enquiry_number && (
                        <div className="mt-1 text-[10px] text-slate-600">{row.enquiry_number}</div>
                      )}
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
              <h2 className="text-sm font-semibold text-white">
                {showForm ? (isEditing ? "Edit Offer" : "New Offer") : "Offer Detail"}
              </h2>
              {!showForm && detail && (
                <p className="text-[11px] text-slate-500">{detail.offer_number} · {fmtDate(detail.offer_date)}</p>
              )}
            </div>
            <button type="button" onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {showForm && (
              <form onSubmit={handleSave} className="space-y-6 p-6">
                {saveError && <ErrorAlert message={saveError} />}

                <section>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Offer Details</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Offer Number *</label>
                      <input value={form.offer_number} onChange={e => setForm(f => ({ ...f, offer_number: e.target.value }))} required
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Offer Date</label>
                      <input type="date" value={form.offer_date} onChange={e => setForm(f => ({ ...f, offer_date: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white [color-scheme:dark] outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Valid Until</label>
                      <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white [color-scheme:dark] outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Currency</label>
                      <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="INR">INR (₹)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Company</label>
                      <select value={form.company_id} onChange={e => {
                        const cid = e.target.value;
                        const co = companies.find(c => String(c.id) === cid);
                        setForm(f => ({ ...f, company_id: cid, kind_attn: f.kind_attn || (co?.contact_person ?? "") }));
                      }}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="">— None —</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Kind Attn</label>
                      <input value={form.kind_attn} onChange={e => setForm(f => ({ ...f, kind_attn: e.target.value }))}
                        placeholder="Contact person name"
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Linked Enquiry</label>
                      <select value={form.enquiry_id} onChange={e => setForm(f => ({ ...f, enquiry_id: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70">
                        <option value="">— None —</option>
                        {enquiries.map(eq => <option key={eq.id} value={eq.id}>{eq.enquiry_number}</option>)}
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Charges</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Packing (%)</label>
                      <input type="number" step="0.01" min="0" value={form.packing_charges_pct}
                        onFocus={e => e.target.select()}
                        onChange={e => setForm(f => ({ ...f, packing_charges_pct: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Freight (₹)</label>
                      <input type="number" step="0.01" min="0" value={form.freight_charges}
                        onFocus={e => e.target.select()}
                        onChange={e => setForm(f => ({ ...f, freight_charges: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">GST (%)</label>
                      <input type="number" step="0.01" min="0" value={form.gst_pct}
                        onFocus={e => e.target.select()}
                        onChange={e => setForm(f => ({ ...f, gst_pct: Number(e.target.value) }))}
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
                  {form.items.length > 0 && (
                    <>
                      <div className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        <span>Product / Description</span><span>Qty</span><span>Unit Price</span><span />
                      </div>
                      <div className="space-y-2">
                        {form.items.map((it, idx) => {
                          const lineTotal = Number(it.quantity) * Number(it.unit_price);
                          const slots = it.product_id ? productSpecs[it.product_id] : undefined;
                          const phKey = form.company_id && it.product_id ? `${form.company_id}_${it.product_id}` : null;
                          const history = phKey ? priceHistory[phKey] : undefined;
                          return (
                            <div key={idx} className="rounded-lg border border-surface-border/60 bg-[#0f1419] p-2.5">
                              <div className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                                <ProductCombobox
                                  value={it.product_id ? { id: it.product_id, name: it.description } : null}
                                  onSelect={p => handleProductSelect(idx, p)}
                                  hasSpecs
                                />
                                <input type="number" min={1} value={it.quantity} onFocus={e => e.target.select()} onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                                  className="rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white outline-none hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]" />
                                <input type="number" step="0.01" min={0} value={it.unit_price} onFocus={e => e.target.select()} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}
                                  className="rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white outline-none hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]" />
                                <button type="button" onClick={() => removeItem(idx)} className="rounded p-1 text-slate-600 hover:text-red-400">✕</button>
                              </div>
                              {/* Price history for this company + product */}
                              {history && history.length > 0 && (
                                <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500/70">Previously quoted to this company</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                    {history.map((h, hi) => (
                                      <button key={hi} type="button"
                                        onClick={() => updateItem(idx, "unit_price", h.unit_price)}
                                        title={`${h.offer_number} — ${h.status} — click to use`}
                                        className="group flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white">
                                        <span className="font-mono font-semibold text-amber-400 group-hover:text-white">₹{Number(h.unit_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                                        <span className="text-slate-600">×{h.quantity}</span>
                                        <span className="text-slate-600">{new Date(h.offer_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</span>
                                        <span className="text-slate-700">·</span>
                                        <span className="text-[10px] text-slate-600">{h.status}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <input value={it.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description *"
                                className="mt-1.5 w-full rounded border border-surface-border/50 bg-[#0b0f14] px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-accent/60" />

                              {slots && slots.length > 0 && (
                                <div className="mt-2 rounded border border-surface-border/40 bg-[#0b0f14]/60 p-2">
                                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Specifications</p>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {slots.map(slot => (
                                      <label key={slot.specification_id} className="flex flex-col gap-0.5">
                                        <span className="truncate text-[10px] text-slate-500" title={slot.spec_name}>{slot.spec_name}</span>
                                        <input
                                          value={it.specs.find(s => s.specification_id === slot.specification_id)?.value ?? ""}
                                          onChange={e => updateSpec(idx, slot.specification_id, e.target.value)}
                                          className="rounded border border-surface-border/50 bg-[#0f1419] px-2 py-1 text-[11px] text-white placeholder-slate-700 outline-none focus:border-accent/60" />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="mt-1 pr-7 text-right font-mono text-[11px] text-slate-500">{fmt(lineTotal)}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 space-y-1.5 rounded-lg border border-surface-border bg-[#0f1419] p-3">
                        <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="font-mono">{fmt(fSubtotal)}</span></div>
                        <div className="flex justify-between text-sm text-slate-400"><span>GST ({form.gst_pct}%)</span><span className="font-mono">{fmt(fTotal - fSubtotal)}</span></div>
                        <div className="flex justify-between border-t border-surface-border pt-2 text-base font-semibold text-white">
                          <span>Total</span><span className="font-mono text-accent">{fmt(fTotal)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </section>

                <section>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Terms & Conditions</p>
                  <div className="overflow-hidden rounded-lg border border-surface-border">
                    {/* Row: Rates Quoted above are */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Rates Quoted above are</span>
                      <select value={form.rates_quoted} onChange={e => setForm(f => ({ ...f, rates_quoted: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5">
                        {["Ex-works", "FOR Destination", "Paid Upto Transport Godown"].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    {/* Row: Packing Charges — derived from Pricing section */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Packing Charges</span>
                      <span className="flex-1 px-3 py-2.5 text-xs text-slate-300">{form.packing_charges_pct}%</span>
                    </div>
                    {/* Row: GST Extra — derived from Pricing section */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">GST Extra</span>
                      <span className="flex-1 px-3 py-2.5 text-xs text-slate-300">{form.gst_pct}%</span>
                    </div>
                    {/* Row: Transportation */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Transportation</span>
                      <select value={form.transportation} onChange={e => setForm(f => ({ ...f, transportation: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5">
                        {["Extra to be paid by Buyer", "Paid by E-safe Enterprises"].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    {/* Row: Delivery */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Delivery</span>
                      <input type="text" value={form.delivery_terms} onChange={e => setForm(f => ({ ...f, delivery_terms: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5" />
                    </div>
                    {/* Row: Payment */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Payment</span>
                      <input type="text" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5" />
                    </div>
                    {/* Row: Freight Charges — derived from Pricing section */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Freight Charges</span>
                      <span className="flex-1 px-3 py-2.5 text-xs text-slate-300">Rs. {Number(form.freight_charges).toFixed(2)}</span>
                    </div>
                    {/* Row: Validity of Our Offer — derived from valid_until */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Validity of Our Offer</span>
                      <span className="flex-1 px-3 py-2.5 text-xs text-slate-300">{form.valid_until || "As per mutual agreement"}</span>
                    </div>
                    {/* Fixed read-only rows */}
                    {[
                      { label: "Manufactured by and Brand", value: "E-SAFE" },
                      { label: "Our GST No.", value: "08AACFE4028Q1Z5" },
                    ].map(row => (
                      <div key={row.label} className="flex items-center border-b border-surface-border/60">
                        <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">{row.label}</span>
                        <span className="flex-1 px-3 py-2.5 text-xs text-slate-500">{row.value}</span>
                      </div>
                    ))}
                    {/* Row: HSN Code — editable */}
                    <div className="flex items-center border-b border-surface-border/60">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">HSN Code</span>
                      <input type="text" value={form.hsn_code} onChange={e => setForm(f => ({ ...f, hsn_code: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5" />
                    </div>
                    {/* Row: Conformity Certificate */}
                    <div className="flex items-center">
                      <span className="w-48 shrink-0 border-r border-surface-border/60 bg-[#0b0f14] px-3 py-2.5 text-xs text-slate-400">Conformity Certificate</span>
                      <input type="text" value={form.conformity_cert} onChange={e => setForm(f => ({ ...f, conformity_cert: e.target.value }))}
                        className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white outline-none focus:bg-accent/5" />
                    </div>
                  </div>
                </section>

                <section>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes</p>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent/70" />
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
                    {saving
                      ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> Saving…</>
                      : isEditing ? "Update" : "Create Offer"}
                  </button>
                </div>
              </form>
            )}

            {!showForm && selectedId !== null && (
              <div className="space-y-5 p-6">
                {detailError && <ErrorAlert message={detailError} />}
                {detailLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </div>
                ) : detail ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">{detail.offer_number}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmtDate(detail.offer_date)}{detail.valid_until ? " · valid until " + fmtDate(detail.valid_until) : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <StatusBadge status={detail.status} offerDate={detail.offer_date} />
                        {detail.status !== "accepted" && (
                          <button type="button" onClick={startEdit}
                            className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-400 hover:text-white">
                            Edit
                          </button>
                        )}
                        <button type="button" onClick={handleDownload} disabled={downloading}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-400 hover:text-white disabled:opacity-50">
                          {downloading ? "…" : "↓ PDF"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Update Status</p>
                      <div className="flex flex-wrap gap-2">
                        {detail.status !== "draft" && (
                          <button type="button" onClick={() => handleStatusChange("draft")}
                            className="rounded-full border border-slate-500/40 bg-slate-500/10 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-500/20">
                            Draft
                          </button>
                        )}
                        {detail.status !== "sent" && (
                          <button type="button" onClick={() => handleStatusChange("sent")}
                            className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20">
                            Open
                          </button>
                        )}
                        {detail.status !== "accepted" && (
                          <button type="button" onClick={() => handleStatusChange("accepted")}
                            className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20">
                            Accept
                          </button>
                        )}
                        {detail.status !== "rejected" && (
                          <button type="button" onClick={() => handleStatusChange("rejected")}
                            className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20">
                            Reject
                          </button>
                        )}
                      </div>
                    </div>


                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Company</p>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Name</p><p className="text-sm text-white">{detail.company_name || "—"}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">GSTIN</p><p className="font-mono text-sm text-white">{detail.company_gstin || "—"}</p></div>
                        {detail.contact_person && <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Contact</p><p className="text-sm text-white">{detail.contact_person}</p></div>}
                        {detail.enquiry_number && <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Enquiry</p><p className="text-sm text-white">{detail.enquiry_number}</p></div>}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Items <span className="ml-1 rounded-full bg-surface-border px-1.5 py-0.5 font-normal text-slate-400">{(detail.items ?? []).length}</span>
                      </p>
                      <div className="overflow-hidden rounded-xl border border-surface-border">
                        <table className="w-full text-sm">
                          <thead className="border-b border-surface-border bg-[#0f1419]/80">
                            <tr>
                              {["Description","Qty","Unit Price","Total"].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(detail.items ?? []).length === 0 ? (
                              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-600">No items.</td></tr>
                            ) : (detail.items ?? []).map((it, i) => (
                              <tr key={i} className={"border-t border-surface-border/40 " + (i % 2 === 1 ? "bg-white/[0.015]" : "")}>
                                <td className="px-3 py-2.5 text-xs font-medium text-white">
                                  {it.description}
                                  {(it.specifications ?? []).length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {(it.specifications ?? []).map(s => (
                                        <span key={s.specification_id} className="rounded bg-surface-border/60 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
                                          {s.spec_name}: <span className="text-slate-200">{s.value}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 align-top text-xs text-slate-300">{it.quantity}</td>
                                <td className="px-3 py-2.5 align-top font-mono text-xs text-slate-300">{fmt(it.unit_price)}</td>
                                <td className="px-3 py-2.5 align-top font-mono text-xs font-semibold text-white">{fmt(it.total_price ?? it.quantity * it.unit_price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {(() => {
                      const dSubtotal = Number(detail.subtotal);
                      const dPacking = dSubtotal * Number(detail.packing_charges_pct) / 100;
                      const dAssessable = dSubtotal + dPacking + Number(detail.freight_charges);
                      const dGst = dAssessable * Number(detail.gst_pct) / 100;
                      return (
                        <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Summary</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="font-mono">{fmt(dSubtotal)}</span></div>
                            {dPacking > 0 && <div className="flex justify-between text-sm text-slate-400"><span>Packing ({detail.packing_charges_pct}%)</span><span className="font-mono">{fmt(dPacking)}</span></div>}
                            {Number(detail.freight_charges) > 0 && <div className="flex justify-between text-sm text-slate-400"><span>Freight</span><span className="font-mono">{fmt(detail.freight_charges)}</span></div>}
                            <div className="flex justify-between text-sm text-slate-400"><span>GST ({detail.gst_pct}%)</span><span className="font-mono">{fmt(dGst)}</span></div>
                            <div className="flex justify-between border-t border-surface-border pt-2 text-base font-semibold text-white">
                              <span>Grand Total</span><span className="font-mono text-accent">{fmt(detail.total_amount)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {detail.terms_conditions && (
                      <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Terms & Conditions</p>
                        <div className="overflow-hidden rounded-lg border border-surface-border/60">
                          {detail.terms_conditions.split("\n").filter(Boolean).map((line, i) => {
                            const sep = line.indexOf(": ");
                            const k = sep > 0 ? line.slice(0, sep) : line;
                            const v = sep > 0 ? line.slice(sep + 2) : "";
                            return (
                              <div key={i} className="flex border-b border-surface-border/40 last:border-b-0">
                                <span className="w-44 shrink-0 border-r border-surface-border/40 bg-[#0b0f14] px-3 py-2 text-[11px] text-slate-500">{k}</span>
                                <span className="flex-1 px-3 py-2 text-[11px] text-slate-300">{v}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {detail.notes && (
                      <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Notes</p>
                        <p className="text-sm text-slate-300">{detail.notes}</p>
                      </div>
                    )}
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
