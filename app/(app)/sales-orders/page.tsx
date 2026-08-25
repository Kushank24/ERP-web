"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SORow = {
  id: number;
  invoice_number: string;
  company_name: string | null;
  total_amount: number;
  status: number;
  sales_date: string | null;
  payment_received?: boolean;
};

type SOLine = {
  id: number;
  product_name: string;
  product_code: string | null;
  quantity_sold: number;
  dispatched_qty: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
};

type SODetail = {
  id: number;
  invoice_number: string;
  company_name: string | null;
  company_location: string | null;
  company_contact: string | null;
  company_gstin: string | null;
  sales_date: string | null;
  delivery_date: string | null;
  gst_rate: number;
  notes: string | null;
  status: number;
  payment_received: boolean;
  total_amount: number;
  lines: SOLine[];
};

type FinishedGood = {
  id: number;
  product_name: string;
  product_code: string | null;
  quantity_in_stock: number;
};

type Company = {
  company_name: string;
  company_location: string | null;
  company_contact: string | null;
  company_gstin: string | null;
};

type DraftLine = {
  finished_good_id: string;
  product_name: string;
  product_code: string;
  quantity_sold: string;
  unit_price: string;
  notes: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, { label: string; classes: string }> = {
  1: {
    label: "Draft",
    classes: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
  2: {
    label: "Confirmed",
    classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  3: {
    label: "Partial Dispatch",
    classes: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  4: {
    label: "Full Dispatch",
    classes: "bg-green-500/15 text-green-400 border-green-500/30",
  },
  5: {
    label: "Cancelled",
    classes: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

const BLANK_LINE: DraftLine = {
  finished_good_id: "",
  product_name: "",
  product_code: "",
  quantity_sold: "",
  unit_price: "",
  notes: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline helper components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number }) {
  const s = STATUS_MAP[status] ?? {
    label: `Status ${status}`,
    classes: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${s.classes}`}
    >
      {s.label}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-border/40 ${className}`}
    />
  );
}

function fmt(n: number): string {
  return `₹${n.toFixed(2)}`;
}

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

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-400"
    >
      <span className="mt-px shrink-0 text-base leading-none">⚠</span>
      <span className="leading-snug">{message}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h3>
  );
}

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
        {hint && <span className="ml-1 text-slate-600">({hint})</span>}
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

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="text-sm font-medium text-white">{children || "—"}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function SalesOrdersPage() {
  // ── List state ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<SORow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState({ invoice: "", company: "", status: "" });

  // ── Detail state ───────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── UI visibility ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);

  // ── Dispatch state ─────────────────────────────────────────────────────────
  const [dispatchQtys, setDispatchQtys] = useState<Record<number, string>>({});
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // ── Payment state ──────────────────────────────────────────────────────────
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Form fields ────────────────────────────────────────────────────────────
  const [fInvoiceNumber, setFInvoiceNumber] = useState("");
  const [fCompanyName, setFCompanyName] = useState("");
  const [fCompanyLocation, setFCompanyLocation] = useState("");
  const [fCompanyContact, setFCompanyContact] = useState("");
  const [fCompanyGSTIN, setFCompanyGSTIN] = useState("");
  const [fSalesDate, setFSalesDate] = useState("");
  const [fDeliveryDate, setFDeliveryDate] = useState("");
  const [fGSTRate, setFGSTRate] = useState("18");
  const [fNotes, setFNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { ...BLANK_LINE },
  ]);

  // ── Dropdown specific states ────────────────────────────────────────────────
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isNewCompany, setIsNewCompany] = useState(false);

  // ── Load SO list and Dropdowns ──────────────────────────────────────────────
  const loadDropdowns = useCallback(() => {
    api<FinishedGood[]>("/api/v1/finished-goods")
      .then(setFinishedGoods)
      .catch(console.error);
    api<Company[]>("/api/v1/sales-orders/companies/list")
      .then(setCompanies)
      .catch(console.error);
  }, []);
  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    api<SORow[]>("/api/v1/sales-orders")
      .then((data) => {
        setRows(data);
        setListLoading(false);
      })
      .catch((e: Error) => {
        setListError(e.message ?? "Failed to load sales orders");
        setListLoading(false);
      });
  }, []);

  useEffect(() => {
    loadList();
    loadDropdowns();
  }, [loadList, loadDropdowns]);

  // ── Load SO detail ─────────────────────────────────────────────────────────
  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    api<SODetail>(`/api/v1/sales-orders/${id}`)
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((e: Error) => {
        setDetailError(e.message ?? "Failed to load sales order details");
        setDetailLoading(false);
      });
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleRowClick(id: number) {
    setSelectedId(id);
    setShowForm(false);
    setSaveError(null);
    loadDetail(id);
  }

  function openNewForm() {
    setShowForm(true);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
  }

  function closeForm() {
    setShowForm(false);
    setSaveError(null);
  }

  function handleCompanyNameChange(name: string) {
    setFCompanyName(name);
    const existing = companies.find((c) => c.company_name === name);
    if (existing) {
      setFCompanyLocation(existing.company_location || "");
      setFCompanyContact(existing.company_contact || "");
      setFCompanyGSTIN(existing.company_gstin || "");
    }
  }

  // ── Draft line helpers ─────────────────────────────────────────────────────
  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setDraftLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setDraftLines((prev) => [...prev, { ...BLANK_LINE }]);
  }

  function removeLine(idx: number) {
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Computed totals — create form ──────────────────────────────────────────
  const formSubtotal = draftLines.reduce((acc, l) => {
    const qty = parseFloat(l.quantity_sold) || 0;
    const price = parseFloat(l.unit_price) || 0;
    return acc + qty * price;
  }, 0);
  const formGSTRate = parseFloat(fGSTRate) || 0;
  const formGSTAmount = (formSubtotal * formGSTRate) / 100;
  const formGrandTotal = formSubtotal + formGSTAmount;

  // ── Computed totals — detail view ──────────────────────────────────────────
  const detailSubtotal = detail
    ? detail.lines.reduce((acc, l) => acc + l.quantity_sold * l.unit_price, 0)
    : 0;
  const detailGSTAmount = detail ? (detailSubtotal * detail.gst_rate) / 100 : 0;
  const detailGrandTotal = detailSubtotal + detailGSTAmount;

  const filteredRows = rows.filter((r) => {
    if (colFilters.invoice && !r.invoice_number.toLowerCase().includes(colFilters.invoice.toLowerCase())) return false;
    if (colFilters.company && !(r.company_name ?? "").toLowerCase().includes(colFilters.company.toLowerCase())) return false;
    if (colFilters.status && r.status !== parseInt(colFilters.status)) return false;
    return true;
  });

  // ── Toggle payment received ────────────────────────────────────────────────
  async function handlePaymentToggle() {
    if (!detail) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const updated = await api<SODetail>(`/api/v1/sales-orders/${detail.id}/payment`, {
        method: "PATCH",
        json: { payment_received: !detail.payment_received },
      });
      setDetail(updated);
      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? { ...r, payment_received: updated.payment_received, status: updated.status }
            : r,
        ),
      );
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Failed to update payment status.",
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  // ── Record dispatch ────────────────────────────────────────────────────────
  async function handleDispatch() {
    if (!detail) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const items = detail.lines
        .filter((l) => parseFloat(dispatchQtys[l.id] || "0") > 0)
        .map((l) => ({ line_id: l.id, dispatch_qty: parseFloat(dispatchQtys[l.id]) }));
      if (items.length === 0) {
        setDispatchError("Enter a quantity to dispatch for at least one item.");
        setDispatching(false);
        return;
      }
      const updated = await api<SODetail>(`/api/v1/sales-orders/${detail.id}/dispatch`, {
        method: "POST",
        json: { items },
      });
      setDetail(updated);
      setDispatchQtys({});
      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id ? { ...r, status: updated.status } : r,
        ),
      );
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : "Failed to record dispatch.",
      );
    } finally {
      setDispatching(false);
    }
  }

  // ── Save new sales order ───────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        invoice_number: fInvoiceNumber.trim(),
        company_name: fCompanyName.trim(),
        company_location: fCompanyLocation.trim() || "",
        company_contact: fCompanyContact.trim() || "",
        company_gstin: fCompanyGSTIN.trim() || null,
        sales_date: fSalesDate || new Date().toISOString().split("T")[0],
        delivery_date: fDeliveryDate || null,
        gst_rate: parseFloat(fGSTRate) || 18,
        notes: fNotes.trim() || null,
        lines: draftLines.map((l) => ({
          finished_good_id: l.finished_good_id ? parseInt(l.finished_good_id, 10) : undefined,
          product_name: l.product_name.trim(),
          product_code: l.product_code.trim() || null,
          quantity_sold: parseFloat(l.quantity_sold) || 0,
          unit_price: parseFloat(l.unit_price) || 0,
          notes: l.notes.trim() || null,
        })),
      };

      const created = await api<SODetail>("/api/v1/sales-orders", {
        method: "POST",
        json: payload,
      });

      // Reset form fields
      setFInvoiceNumber("");
      setFCompanyName("");
      setFCompanyLocation("");
      setFCompanyContact("");
      setFCompanyGSTIN("");
      setFSalesDate("");
      setFDeliveryDate("");
      setFGSTRate("18");
      setFNotes("");
      setDraftLines([{ ...BLANK_LINE }]);
      setShowForm(false);

      // Show the newly created SO in the detail panel
      setSelectedId(created.id);
      setDetail(created);
      setDetailError(null);

      // Refresh the list so the new SO appears
      loadList();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save sales order. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const panelOpen = showForm || selectedId !== null;

  function closePanel() {
    setShowForm(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 gap-5">
      {/* ════════════════════════════════════════════════════════════════════
          LEFT PANEL — Sales Order List (40%)
      ════════════════════════════════════════════════════════════════════ */}
      <div className={`flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out ${panelOpen ? "w-[38%]" : "w-full"}`}>
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Sales Orders</h2>
            <p className="text-[11px] text-slate-500">
              {listLoading
                ? "Loading…"
                : `${filteredRows.length}${filteredRows.length !== rows.length ? ` of ${rows.length}` : ""} order${filteredRows.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadList}
              disabled={listLoading}
              title="Refresh list"
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span
                className={`inline-block ${listLoading ? "animate-spin" : ""}`}
              >
                ↻
              </span>
              Refresh
            </button>
            <button
              type="button"
              onClick={openNewForm}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
            >
              + New
            </button>
          </div>
        </div>

        {/* List-level error */}
        {listError && (
          <div className="px-4 pt-3">
            <ErrorAlert message={listError} />
          </div>
        )}

        {/* Column filters */}
        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_auto] items-center gap-2">
            <input type="search" value={colFilters.invoice} placeholder="Invoice #…"
              onChange={e => setColFilters(p => ({ ...p, invoice: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <input type="search" value={colFilters.company} placeholder="Company…"
              onChange={e => setColFilters(p => ({ ...p, company: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <div />
            <select value={colFilters.status}
              onChange={e => setColFilters(p => ({ ...p, status: e.target.value }))}
              className="rounded border border-surface-border/60 bg-[#0b0f14] px-1.5 py-1 text-[11px] text-slate-300 outline-none transition focus:border-accent/50">
              <option value="">All</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Column header bar */}
        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_auto] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            <span>Invoice #</span>
            <span>Company</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
          </div>
        </div>

        {/* Scrollable row list */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            /* Loading skeleton — 7 placeholder rows */
            <div className="space-y-px p-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg px-2 py-3"
                >
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 && !listError ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {(colFilters.invoice || colFilters.company || colFilters.status) ? "No orders match the active filters." : "No sales orders found."}
            </div>
          ) : (
            <ul>
              {filteredRows.map((row) => {
                const isActive = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(row.id)}
                      className={`w-full border-b border-surface-border/30 px-4 py-3 text-left last:border-b-0 transition-colors ${
                        isActive
                          ? "border-l-2 border-l-accent bg-accent/10"
                          : "hover:bg-white/[0.025]"
                      }`}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_auto] items-center gap-2">
                        <span
                          className={`truncate text-xs font-semibold ${
                            isActive ? "text-accent" : "text-white"
                          }`}
                        >
                          {row.invoice_number}
                        </span>
                        <span className="truncate text-xs text-slate-400">
                          {row.company_name ?? "—"}
                        </span>
                        <span className="text-right font-mono text-xs text-slate-300">
                          {fmt(row.total_amount)}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="mt-1 text-[10px] text-slate-600">
                        Date:{" "}
                        <span className="text-slate-500">
                          {fmtDate(row.sales_date)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          RIGHT PANEL — slides in when a row is selected or form is open
      ════════════════════════════════════════════════════════════════════ */}
      {panelOpen && (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {showForm ? "New Sales Order" : "Sales Order Detail"}
            </h2>
            {showForm && (
              <p className="text-[11px] text-slate-500">
                Fill in the details below and add product lines.
              </p>
            )}
            {!showForm && detail && (
              <p className="text-[11px] text-slate-500">
                {detail.invoice_number}
                {detail.sales_date ? ` · ${fmtDate(detail.sales_date)}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closePanel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Close panel"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable panel body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ──────────────────────────────────────────────────────────────
              VIEW A: CREATE FORM
          ────────────────────────────────────────────────────────────── */}
          {showForm && (
            <form onSubmit={handleSave} className="space-y-7 p-6">
              {/* Save-level error */}
              {saveError && <ErrorAlert message={saveError} />}

              {/* ── Section: Order Information ── */}
              <section>
                <SectionHeading>Order Information</SectionHeading>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <FormField
                    label="Invoice Number"
                    required
                    hint="e.g. INV-2025-001"
                  >
                    <Input
                      value={fInvoiceNumber}
                      onChange={(e) => setFInvoiceNumber(e.target.value)}
                      placeholder="INV-2025-001"
                      required
                    />
                  </FormField>
                  <FormField label="Sales Date">
                    <Input
                      type="date"
                      value={fSalesDate}
                      onChange={(e) => setFSalesDate(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </FormField>
                  <FormField label="Delivery Date">
                    <Input
                      type="date"
                      value={fDeliveryDate}
                      onChange={(e) => setFDeliveryDate(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </FormField>
                  <FormField label="GST Rate (%)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={fGSTRate}
                      onChange={(e) => setFGSTRate(e.target.value)}
                      placeholder="18"
                    />
                  </FormField>
                </div>
              </section>

              {/* ── Section: Customer Information ── */}
              <section>
                <SectionHeading>Customer Information</SectionHeading>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <FormField label="Company Name" required>
                    {!isNewCompany ? (
                      <select
                        required
                        value={fCompanyName}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "___NEW___") {
                            setIsNewCompany(true);
                            setFCompanyName("");
                          } else {
                            handleCompanyNameChange(val);
                          }
                        }}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
                      >
                        <option value="">-- Select Company --</option>
                        <option value="___NEW___">+ Add New Company</option>
                        {companies.map((c) => (
                          <option key={c.company_name} value={c.company_name}>{c.company_name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={fCompanyName}
                          onChange={(e) => handleCompanyNameChange(e.target.value)}
                          placeholder="Company Name"
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewCompany(false);
                            setFCompanyName("");
                          }}
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-surface-border/50 hover:text-white"
                          title="Cancel new company"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </FormField>
                  <FormField label="Location">
                    <Input
                      value={fCompanyLocation}
                      onChange={(e) => setFCompanyLocation(e.target.value)}
                      placeholder="Mumbai, MH"
                    />
                  </FormField>
                  <FormField label="Contact">
                    <Input
                      value={fCompanyContact}
                      onChange={(e) => setFCompanyContact(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </FormField>
                  <FormField label="GSTIN">
                    <Input
                      value={fCompanyGSTIN}
                      onChange={(e) => setFCompanyGSTIN(e.target.value)}
                      placeholder="27AAAAA0000A1Z5"
                      className="font-mono"
                    />
                  </FormField>
                </div>
              </section>

              {/* ── Section: Notes ── */}
              <section>
                <SectionHeading>Notes</SectionHeading>
                <div className="mt-3">
                  <Textarea
                    rows={3}
                    value={fNotes}
                    onChange={(e) => setFNotes(e.target.value)}
                    placeholder="Any additional notes or instructions…"
                  />
                </div>
              </section>

              {/* ── Section: Items ── */}
              <section>
                <div className="flex items-center justify-between">
                  <SectionHeading>
                    Items
                    <span className="ml-2 rounded-full bg-surface-border px-2 py-0.5 text-[10px] font-normal text-slate-400">
                      {draftLines.length} line
                      {draftLines.length !== 1 ? "s" : ""}
                    </span>
                  </SectionHeading>
                  <button
                    type="button"
                    onClick={addLine}
                    className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className="text-base leading-none">+</span>
                    Add Item
                  </button>
                </div>

                {/* Column header */}
                <div className="mt-3 grid grid-cols-[2fr_1.2fr_0.8fr_1fr_1.2fr_1.2fr_auto] items-center gap-2 border-b border-surface-border/50 pb-1.5">
                  {[
                    "Product Name",
                    "Product Code",
                    "Qty",
                    "Unit Price",
                    "Line Total",
                    "Notes",
                    "",
                  ].map((h, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Draft line rows */}
                <div className="mt-2 space-y-2">
                  {draftLines.map((line, idx) => {
                    const qty = parseFloat(line.quantity_sold) || 0;
                    const price = parseFloat(line.unit_price) || 0;
                    const lineTotal = qty * price;
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_1.2fr_1.2fr_auto] items-center gap-2 rounded-lg border border-surface-border/60 bg-[#0f1419] p-2.5"
                      >
                        {/* Product Name (Dropdown) */}
                        <select
                          required
                          value={line.finished_good_id}
                          onChange={(e) => {
                            const fgId = e.target.value;
                            const fg = finishedGoods.find((f) => f.id.toString() === fgId);
                            if (fg) {
                              updateLine(idx, {
                                finished_good_id: fgId,
                                product_name: fg.product_name,
                                product_code: fg.product_code || "",
                              });
                            } else {
                              updateLine(idx, {
                                finished_good_id: "",
                                product_name: "",
                                product_code: "",
                              });
                            }
                          }}
                          className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1.5 text-xs text-white outline-none transition focus:border-accent/60"
                        >
                          <option value="">Select Finished Good...</option>
                          {finishedGoods.map((fg) => (
                            <option key={fg.id} value={fg.id}>
                              {fg.product_name} {fg.product_code ? `(${fg.product_code})` : ""} - Stock: {fg.quantity_in_stock}
                            </option>
                          ))}
                        </select>
                        {/* Product Code */}
                        <input
                          value={line.product_code}
                          onChange={(e) =>
                            updateLine(idx, { product_code: e.target.value })
                          }
                          placeholder="SKU-001"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 font-mono text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                        />
                        {/* Quantity */}
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.quantity_sold}
                          onChange={(e) =>
                            updateLine(idx, { quantity_sold: e.target.value })
                          }
                          placeholder="0"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                        />
                        {/* Unit Price */}
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(idx, { unit_price: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                        />
                        {/* Line Total (read-only) */}
                        <span className="text-right font-mono text-xs text-slate-300">
                          {fmt(lineTotal)}
                        </span>
                        {/* Notes */}
                        <input
                          value={line.notes}
                          onChange={(e) =>
                            updateLine(idx, { notes: e.target.value })
                          }
                          placeholder="Optional note"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-slate-400 placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14] focus:text-white"
                        />
                        {/* Remove line button */}
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={draftLines.length === 1}
                          title="Remove line"
                          className="rounded p-1.5 text-slate-600 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Running totals panel */}
                <div className="mt-4 space-y-2 rounded-lg border border-surface-border bg-[#0f1419] p-4">
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-mono">{fmt(formSubtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>
                      GST{" "}
                      <span className="text-slate-500">({formGSTRate}%)</span>
                    </span>
                    <span className="font-mono">{fmt(formGSTAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-surface-border pt-2.5 text-base font-semibold text-white">
                    <span>Grand Total</span>
                    <span className="font-mono text-accent">
                      {fmt(formGrandTotal)}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Form action buttons ── */}
              <div className="flex items-center justify-end gap-3 pb-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-surface-border px-5 py-2 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex min-w-[10rem] items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                      Saving…
                    </>
                  ) : (
                    "Save Sales Order"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ──────────────────────────────────────────────────────────────
              VIEW B: DETAIL VIEW
          ────────────────────────────────────────────────────────────── */}
          {!showForm && selectedId !== null && (
            <div className="space-y-6 p-6">
              {/* Detail-level error */}
              {detailError && <ErrorAlert message={detailError} />}

              {detailLoading ? (
                /* Detail loading skeleton */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-28 rounded-xl" />
                  <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                  <Skeleton className="h-40 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              ) : detail ? (
                <>
                  {/* ── Header row: Invoice number + status badge + payment toggle ── */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {detail.invoice_number}
                      </h3>
                      {detail.sales_date && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Sales date: {fmtDate(detail.sales_date)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={detail.status} />
                      <button
                        type="button"
                        onClick={handlePaymentToggle}
                        disabled={paymentLoading}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          detail.payment_received
                            ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "border-surface-border text-slate-400 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {detail.payment_received ? "✓ Payment Received" : "Payment Pending"}
                      </button>
                    </div>
                  </div>
                  {paymentError && <ErrorAlert message={paymentError} />}

                  {/* ── Customer information card ── */}
                  <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Customer Information
                    </p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <DetailField label="Company Name">
                        {detail.company_name ?? "—"}
                      </DetailField>
                      <DetailField label="Location">
                        {detail.company_location ?? "—"}
                      </DetailField>
                      <DetailField label="Contact">
                        {detail.company_contact ?? "—"}
                      </DetailField>
                      <DetailField label="GSTIN">
                        <span className="font-mono">
                          {detail.company_gstin ?? "—"}
                        </span>
                      </DetailField>
                    </div>
                  </div>

                  {/* ── Order dates & tax card ── */}
                  <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Order Details
                    </p>
                    <div className="grid grid-cols-3 gap-x-8 gap-y-3">
                      <DetailField label="Sales Date">
                        {fmtDate(detail.sales_date)}
                      </DetailField>
                      <DetailField label="Delivery Date">
                        {fmtDate(detail.delivery_date)}
                      </DetailField>
                      <DetailField label="GST Rate">
                        {detail.gst_rate}%
                      </DetailField>
                    </div>
                    {detail.notes && (
                      <div className="mt-3 border-t border-surface-border/50 pt-3">
                        <p className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                          Notes
                        </p>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {detail.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ── Items table ── */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Items{" "}
                      <span className="ml-1 rounded-full bg-surface-border px-1.5 py-0.5 font-normal text-slate-400">
                        {detail.lines.length}
                      </span>
                    </p>
                    <div className="overflow-hidden rounded-xl border border-surface-border">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-surface-border bg-[#0f1419]/80">
                          <tr>
                            {[
                              "Product",
                              "Code",
                              "Qty",
                              "Dispatched",
                              "Unit Price",
                              "Total",
                              "Notes",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lines.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-3 py-4 text-center text-xs text-slate-600"
                              >
                                No line items found.
                              </td>
                            </tr>
                          ) : (
                            detail.lines.map((line, idx) => (
                              <tr
                                key={line.id}
                                className={`border-t border-surface-border/40 ${
                                  idx % 2 === 1 ? "bg-white/[0.015]" : ""
                                }`}
                              >
                                <td className="px-3 py-2.5 text-xs font-medium text-white">
                                  {line.product_name}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                                  {line.product_code ?? "—"}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-300">
                                  {line.quantity_sold}
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  <span
                                    className={
                                      line.dispatched_qty >= line.quantity_sold
                                        ? "text-green-400"
                                        : line.dispatched_qty > 0
                                          ? "text-orange-400"
                                          : "text-slate-600"
                                    }
                                  >
                                    {line.dispatched_qty ?? 0} / {line.quantity_sold}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs text-slate-300">
                                  {fmt(line.unit_price)}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-white">
                                  {fmt(
                                    line.total_price ??
                                      line.quantity_sold * line.unit_price,
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-500">
                                  {line.notes ?? "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Dispatch panel (hidden once fully dispatched) ── */}
                  {detail.status < 4 && (
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Record Dispatch
                      </p>
                      {dispatchError && (
                        <div className="mb-3">
                          <ErrorAlert message={dispatchError} />
                        </div>
                      )}
                      <div className="space-y-2">
                        {detail.lines
                          .filter((l) => (l.dispatched_qty ?? 0) < l.quantity_sold)
                          .map((line) => {
                            const remaining = line.quantity_sold - (line.dispatched_qty ?? 0);
                            return (
                              <div
                                key={line.id}
                                className="grid grid-cols-[1fr_auto_10rem] items-center gap-3"
                              >
                                <span className="truncate text-xs text-slate-300">
                                  {line.product_name}
                                  <span className="ml-1.5 text-slate-600">
                                    (remaining: {remaining})
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-600">Qty to dispatch</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  max={remaining}
                                  placeholder={`0 – ${remaining}`}
                                  value={dispatchQtys[line.id] ?? ""}
                                  onChange={(e) =>
                                    setDispatchQtys((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
                                />
                              </div>
                            );
                          })}
                        {detail.lines.every((l) => (l.dispatched_qty ?? 0) >= l.quantity_sold) && (
                          <p className="text-xs text-slate-600">All items fully dispatched.</p>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={handleDispatch}
                          disabled={dispatching}
                          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {dispatching ? (
                            <>
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                              Saving…
                            </>
                          ) : (
                            "Record Dispatch"
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Totals block ── */}
                  <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Order Summary
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>Subtotal</span>
                        <span className="font-mono">{fmt(detailSubtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>
                          GST{" "}
                          <span className="text-slate-500">
                            ({detail.gst_rate}%)
                          </span>
                        </span>
                        <span className="font-mono">
                          {fmt(detailGSTAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-surface-border pt-2.5 text-base font-semibold text-white">
                        <span>Grand Total</span>
                        <span className="font-mono text-accent">
                          {fmt(detailGrandTotal)}
                        </span>
                      </div>
                    </div>
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
