"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { api, apiBlob } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PORow = {
  id: number;
  purchase_number: string;
  supplier_name: string | null;
  total_amount: number;
  status: number;
  order_delivery_date: string | null;
  created_at: string | null;
};

type POLine = {
  id: number;
  material_name: string;
  length_weight_nos: number;
  delivered_qty: number;
  per_unit_cost: number;
  unit: string;
  comment: string | null;
};

type PODetail = {
  id: number;
  purchase_number: string;
  supplier_name: string | null;
  supplier_location: string | null;
  supplier_contact: string | null;
  supplier_gstin: string | null;
  total_amount: number;
  gst_rate: number;
  order_delivery_date: string | null;
  status: number;
  lines: POLine[];
};

type Supplier = {
  id: number;
  supplier_name: string;
  supplier_location: string | null;
  supplier_contact: string | null;
  supplier_gstin: string | null;
};

type Material = {
  id: number;
  name: string;
  unit: string;
  per_unit_cost: number;
};

type DraftLine = {
  material_name: string;
  length_weight_nos: string;
  per_unit_cost: string;
  unit: string;
  comment: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, { label: string; classes: string }> = {
  1: {
    label: "Pending",
    classes: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  },
  2: {
    label: "Confirmed",
    classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  3: {
    label: "Partial Delivery",
    classes: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  4: {
    label: "Delivered",
    classes: "bg-green-500/15 text-green-400 border-green-500/30",
  },
  5: {
    label: "Cancelled",
    classes: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

const UNITS = ["Nos", "Kg", "Meter", "Set"] as const;

const BLANK_LINE: DraftLine = {
  material_name: "",
  length_weight_nos: "",
  per_unit_cost: "",
  unit: "Nos",
  comment: "",
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
      <p className="text-sm font-medium text-white">{children}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  // ── List state ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<PORow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState({ po: "", supplier: "", status: "" });

  // ── Detail state ───────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── UI visibility ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── PDF download state ─────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ── Receive state ────────────────────────────────────────────────────────
  const [receivingMode, setReceivingMode] = useState(false);
  const [receiveMap, setReceiveMap] = useState<Record<number, string>>({});
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // ── Form fields ────────────────────────────────────────────────────────────
  const [fPONumber, setFPONumber] = useState("");
  const [fSupplierName, setFSupplierName] = useState("");
  const [fSupplierLocation, setFSupplierLocation] = useState("");
  const [fSupplierContact, setFSupplierContact] = useState("");
  const [fSupplierGSTIN, setFSupplierGSTIN] = useState("");
  const [fDeliveryDate, setFDeliveryDate] = useState("");
  const [fGSTRate, setFGSTRate] = useState("18");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { ...BLANK_LINE },
  ]);

  // ── Dropdown specific states ────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isNewSupplier, setIsNewSupplier] = useState(false);

  // ── Load PO list and Dropdowns ──────────────────────────────────────────────
  const loadDropdowns = useCallback(() => {
    api<Supplier[]>("/api/v1/purchase-orders/suppliers/list")
      .then(setSuppliers)
      .catch(console.error);
    api<Material[]>("/api/v1/materials")
      .then(setMaterials)
      .catch(console.error);
  }, []);
  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    api<PORow[]>("/api/v1/purchase-orders")
      .then((data) => {
        setRows(data);
        setListLoading(false);
      })
      .catch((e: Error) => {
        setListError(e.message ?? "Failed to load purchase orders");
        setListLoading(false);
      });
  }, []);

  useEffect(() => {
    loadList();
    loadDropdowns();
  }, [loadList, loadDropdowns]);

  // ── Load PO detail ─────────────────────────────────────────────────────────
  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    api<PODetail>(`/api/v1/purchase-orders/${id}`)
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((e: Error) => {
        setDetailError(e.message ?? "Failed to load purchase order details");
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

  function handleReceiveToggle() {
    setReceivingMode(!receivingMode);
    setReceiveMap({});
    setReceiveError(null);
  }

  async function handleReceiveSubmit() {
    if (!detail) return;
    setReceiving(true);
    setReceiveError(null);
    try {
      const items = Object.entries(receiveMap)
        .map(([id, qty]) => ({
          line_id: parseInt(id),
          receive_qty: parseFloat(qty) || 0,
        }))
        .filter((x) => x.receive_qty > 0);

      if (items.length === 0) throw new Error("Enter at least one quantity to receive.");

      const updated = await api<PODetail>(`/api/v1/purchase-orders/${detail.id}/receive`, {
        method: "POST",
        json: { items },
      });
      setDetail(updated);
      setReceivingMode(false);
      setReceiveMap({});
      loadList();
    } catch (e: any) {
      setReceiveError(e.message || "Failed to receive quantities.");
    } finally {
      setReceiving(false);
    }
  }

  function handleSupplierNameChange(name: string) {
    setFSupplierName(name);
    const existing = suppliers.find((s) => s.supplier_name === name);
    if (existing) {
      setFSupplierLocation(existing.supplier_location || "");
      setFSupplierContact(existing.supplier_contact || "");
      setFSupplierGSTIN(existing.supplier_gstin || "");
    }
  }

  function handleMaterialNameChange(idx: number, name: string) {
    const existing = materials.find((m) => m.name === name);
    if (existing) {
      updateLine(idx, { 
        material_name: name,
        unit: existing.unit,
        per_unit_cost: existing.per_unit_cost.toString()
      });
    } else {
      updateLine(idx, { material_name: name });
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
    const qty = parseFloat(l.length_weight_nos) || 0;
    const cost = parseFloat(l.per_unit_cost) || 0;
    return acc + qty * cost;
  }, 0);
  const formGSTRate = parseFloat(fGSTRate) || 0;
  const formGSTAmount = (formSubtotal * formGSTRate) / 100;
  const formGrandTotal = formSubtotal + formGSTAmount;

  // ── Computed totals — detail view ──────────────────────────────────────────
  const detailSubtotal = detail
    ? detail.lines.reduce(
        (acc, l) => acc + l.length_weight_nos * l.per_unit_cost,
        0,
      )
    : 0;
  const detailGSTAmount = detail ? (detailSubtotal * detail.gst_rate) / 100 : 0;
  const detailGrandTotal = detailSubtotal + detailGSTAmount;

  const filteredRows = rows.filter((r) => {
    if (colFilters.po && !r.purchase_number.toLowerCase().includes(colFilters.po.toLowerCase())) return false;
    if (colFilters.supplier && !(r.supplier_name ?? "").toLowerCase().includes(colFilters.supplier.toLowerCase())) return false;
    if (colFilters.status && r.status !== parseInt(colFilters.status)) return false;
    return true;
  });

  // ── Save new purchase order ────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        purchase_number: fPONumber.trim(),
        supplier_name: fSupplierName.trim(),
        supplier_location: fSupplierLocation.trim() || "",
        supplier_contact: fSupplierContact.trim() || "",
        supplier_gstin: fSupplierGSTIN.trim() || null,
        order_delivery_date: fDeliveryDate || null,
        gst_rate: parseFloat(fGSTRate) || 18,
        lines: draftLines.map((l) => ({
          material_name: l.material_name.trim(),
          length_weight_nos: parseFloat(l.length_weight_nos) || 0,
          per_unit_cost: parseFloat(l.per_unit_cost) || 0,
          unit: l.unit,
          comment: l.comment.trim() || null,
        })),
      };

      const created = await api<PODetail>("/api/v1/purchase-orders", {
        method: "POST",
        json: payload,
      });

      // Reset form fields
      setFPONumber("");
      setFSupplierName("");
      setFSupplierLocation("");
      setFSupplierContact("");
      setFSupplierGSTIN("");
      setFDeliveryDate("");
      setFGSTRate("18");
      setDraftLines([{ ...BLANK_LINE }]);
      setShowForm(false);

      // Show the newly created PO in the detail panel
      setSelectedId(created.id);
      setDetail(created);
      setDetailError(null);

      // Refresh the list so the new PO appears
      loadList();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save purchase order. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── PDF download ────────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    if (!detail) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const { blob, filename } = await apiBlob(
        `/api/v1/purchase-orders/${detail.id}/pdf`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setPdfError(e.message || "Failed to download PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Derive created_at from list row (detail API does not return it) ─────────
  const matchedRow = rows.find((r) => r.id === selectedId) ?? null;

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
          LEFT PANEL — Purchase Order List  (40 %)
      ════════════════════════════════════════════════════════════════════ */}
      <div className={`flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out ${panelOpen ? "w-[38%]" : "w-full"}`}>
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Purchase Orders
            </h2>
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
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-center gap-2">
            <input type="search" value={colFilters.po} placeholder="PO #…"
              onChange={e => setColFilters(p => ({ ...p, po: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <input type="search" value={colFilters.supplier} placeholder="Supplier…"
              onChange={e => setColFilters(p => ({ ...p, supplier: e.target.value }))}
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
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            <span>PO #</span>
            <span>Supplier</span>
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
              {(colFilters.po || colFilters.supplier || colFilters.status) ? "No orders match the active filters." : "No purchase orders found."}
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
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-center gap-2">
                        <span
                          className={`truncate text-xs font-semibold ${
                            isActive ? "text-accent" : "text-white"
                          }`}
                        >
                          {row.purchase_number}
                        </span>
                        <span className="truncate text-xs text-slate-400">
                          {row.supplier_name ?? "—"}
                        </span>
                        <span className="text-right font-mono text-xs text-slate-300">
                          {fmt(row.total_amount)}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="mt-1 text-[10px] text-slate-600">
                        Delivery:{" "}
                        <span className="text-slate-500">
                          {fmtDate(row.order_delivery_date)}
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
              {showForm ? "New Purchase Order" : "Purchase Order Detail"}
            </h2>
            {showForm && (
              <p className="text-[11px] text-slate-500">
                Fill in the details below and add material lines.
              </p>
            )}
            {!showForm && detail && (
              <p className="text-[11px] text-slate-500">
                {detail.purchase_number}
                {matchedRow?.created_at
                  ? ` · Created ${fmtDate(matchedRow.created_at)}`
                  : ""}
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
                  <FormField label="PO Number" required hint="e.g. PO-2025-001">
                    <Input
                      value={fPONumber}
                      onChange={(e) => setFPONumber(e.target.value)}
                      placeholder="PO-2025-001"
                      required
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
                </div>
              </section>

              {/* ── Section: Supplier Information ── */}
              <section>
                <SectionHeading>Supplier Information</SectionHeading>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <FormField label="Supplier Name" required>
                    {!isNewSupplier ? (
                      <select
                        required
                        value={fSupplierName}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "___NEW___") {
                            setIsNewSupplier(true);
                            setFSupplierName("");
                          } else {
                            handleSupplierNameChange(val);
                          }
                        }}
                        className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
                      >
                        <option value="">-- Select Supplier --</option>
                        <option value="___NEW___">+ Add New Supplier</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={fSupplierName}
                          onChange={(e) => setFSupplierName(e.target.value)}
                          placeholder="Supplier Name"
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewSupplier(false);
                            setFSupplierName("");
                          }}
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-surface-border/50 hover:text-white"
                          title="Cancel new supplier"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </FormField>
                  <FormField label="Location">
                    <Input
                      value={fSupplierLocation}
                      onChange={(e) => setFSupplierLocation(e.target.value)}
                      placeholder="Mumbai, MH"
                    />
                  </FormField>
                  <FormField label="Contact">
                    <Input
                      value={fSupplierContact}
                      onChange={(e) => setFSupplierContact(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </FormField>
                  <FormField label="GSTIN">
                    <Input
                      value={fSupplierGSTIN}
                      onChange={(e) => setFSupplierGSTIN(e.target.value)}
                      placeholder="27AAAAA0000A1Z5"
                      className="font-mono"
                    />
                  </FormField>
                </div>
              </section>

              {/* ── Section: Tax ── */}
              <section>
                <SectionHeading>Tax</SectionHeading>
                <div className="mt-3 w-44">
                  <FormField label="GST Rate (%)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={fGSTRate}
                      onChange={(e) => setFGSTRate(e.target.value)}
                    />
                  </FormField>
                </div>
              </section>

              {/* ── Section: Materials ── */}
              <section>
                <div className="flex items-center justify-between">
                  <SectionHeading>
                    Materials
                    <span className="ml-2 rounded-full bg-surface-border px-2 py-0.5 text-[10px] font-normal text-slate-400">
                      {draftLines.length} line
                      {draftLines.length !== 1 ? "s" : ""}
                    </span>
                  </SectionHeading>
                  <button
                    type="button"
                    onClick={addLine}
                    className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    + Add Line
                  </button>
                </div>

                {/* Line column headers */}
                <div className="mt-3 grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr_1.4fr_auto] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  <span>Material Name</span>
                  <span>Qty / Wt / Nos</span>
                  <span>Unit</span>
                  <span>Cost / Unit</span>
                  <span className="text-right">Subtotal</span>
                  <span>Comment</span>
                  <span />
                </div>

                {/* Draft line rows */}
                <div className="mt-1.5 space-y-2">
                  {draftLines.map((line, idx) => {
                    const qty = parseFloat(line.length_weight_nos) || 0;
                    const cost = parseFloat(line.per_unit_cost) || 0;
                    const lineSubtotal = qty * cost;
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr_1.4fr_auto] items-center gap-2 rounded-lg border border-surface-border/60 bg-[#0f1419] p-2.5"
                      >
                        {/* Material name */}
                        <input
                          list={`materials-datalist-${idx}`}
                          required
                          value={line.material_name}
                          onChange={(e) => handleMaterialNameChange(idx, e.target.value)}
                          placeholder="MS Pipe 2 inch"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                          autoComplete="off"
                        />
                        <datalist id={`materials-datalist-${idx}`}>
                          {materials.map((m) => (
                            <option key={m.id} value={m.name} />
                          ))}
                        </datalist>
                        {/* Qty / weight / nos */}
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.length_weight_nos}
                          onChange={(e) =>
                            updateLine(idx, {
                              length_weight_nos: e.target.value,
                            })
                          }
                          placeholder="0"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                        />
                        {/* Unit dropdown */}
                        <select
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(idx, { unit: e.target.value })
                          }
                          className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1.5 text-xs text-white outline-none transition focus:border-accent/60"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        {/* Cost per unit */}
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.per_unit_cost}
                          onChange={(e) =>
                            updateLine(idx, { per_unit_cost: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
                        />
                        {/* Line subtotal (read-only) */}
                        <span className="text-right font-mono text-xs text-slate-300">
                          {fmt(lineSubtotal)}
                        </span>
                        {/* Comment */}
                        <input
                          value={line.comment}
                          onChange={(e) =>
                            updateLine(idx, { comment: e.target.value })
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
                    "Save Purchase Order"
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
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-28 rounded-xl" />
                  <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                  <Skeleton className="h-52 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                </div>
              ) : detail ? (
                <>
                  {/* ── PO title row ── */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {detail.purchase_number}
                      </h3>
                      {matchedRow?.created_at && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Created {fmtDate(matchedRow.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={detail.status} />
                      {detail.status !== 4 && detail.status !== 5 && (
                        <button
                          type="button"
                          onClick={handleReceiveToggle}
                          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
                        >
                          {receivingMode ? "Cancel Receive" : "Receive Items"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={pdfLoading}
                        className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pdfLoading ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                            Generating…
                          </>
                        ) : (
                          <>↓ PDF</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* ── Receive / PDF errors ── */}
                  {receiveError && <ErrorAlert message={receiveError} />}
                  {pdfError && <ErrorAlert message={pdfError} />}

                  {/* ── Supplier information card ── */}
                  <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Supplier Information
                    </p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <DetailField label="Supplier Name">
                        {detail.supplier_name ?? "—"}
                      </DetailField>
                      <DetailField label="Location">
                        {detail.supplier_location ?? "—"}
                      </DetailField>
                      <DetailField label="Contact">
                        {detail.supplier_contact ?? "—"}
                      </DetailField>
                      <DetailField label="GSTIN">
                        <span className="font-mono">
                          {detail.supplier_gstin ?? "—"}
                        </span>
                      </DetailField>
                    </div>
                  </div>

                  {/* ── Order metadata row ── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Delivery Date
                      </p>
                      <p className="text-sm font-medium text-white">
                        {fmtDate(detail.order_delivery_date)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        GST Rate
                      </p>
                      <p className="text-sm font-medium text-white">
                        {detail.gst_rate}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </p>
                      <div className="mt-0.5">
                        <StatusBadge status={detail.status} />
                      </div>
                    </div>
                  </div>

                  {/* ── Materials table ── */}
                  <section>
                    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Materials{" "}
                      <span className="ml-1 rounded-full bg-surface-border px-2 py-0.5 font-normal text-slate-400">
                        {detail.lines.length} line
                        {detail.lines.length !== 1 ? "s" : ""}
                      </span>
                    </p>
                    <div className="overflow-hidden rounded-xl border border-surface-border">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-surface-border bg-[#0f1419]">
                          <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="px-3.5 py-2.5">#</th>
                            <th className="px-3.5 py-2.5">Material</th>
                            <th className="px-3.5 py-2.5 text-right">
                              Qty / Wt
                            </th>
                            <th className="px-3.5 py-2.5">Unit</th>
                            <th className="px-3.5 py-2.5 text-right">
                              Delivered
                            </th>
                            <th className="px-3.5 py-2.5 text-right">
                              Cost / Unit
                            </th>
                            <th className="px-3.5 py-2.5 text-right">
                              Subtotal
                            </th>
                            {receivingMode && (
                              <th className="px-3.5 py-2.5 bg-accent/10 border-l border-surface-border text-center">
                                Receive Qty
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lines.length === 0 ? (
                            <tr>
                              <td
                                colSpan={receivingMode ? 8 : 7}
                                className="px-3.5 py-8 text-center text-xs text-slate-600"
                              >
                                No materials on this purchase order.
                              </td>
                            </tr>
                          ) : (
                            detail.lines.map((l, idx) => (
                              <tr
                                key={l.id}
                                className="border-b border-surface-border/40 last:border-b-0 hover:bg-white/[0.02]"
                              >
                                <td className="px-3.5 py-2.5 text-xs text-slate-600">
                                  {idx + 1}
                                </td>
                                <td className="px-3.5 py-2.5 font-medium text-white">
                                  {l.material_name}
                                  {l.comment && (
                                    <div className="mt-0.5 text-[10px] text-slate-500">
                                      {l.comment}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-mono text-sm text-slate-300">
                                  {l.length_weight_nos}
                                </td>
                                <td className="px-3.5 py-2.5 text-xs text-slate-400">
                                  {l.unit}
                                </td>
                                <td className="px-3.5 py-2.5 text-right text-xs">
                                  <span className={
                                    (l.delivered_qty || 0) >= l.length_weight_nos
                                      ? "text-green-400 font-semibold"
                                      : "text-amber-400"
                                  }>
                                    {l.delivered_qty || 0}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-mono text-sm text-slate-300">
                                  {fmt(l.per_unit_cost)}
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-mono text-sm font-medium text-slate-200">
                                  {fmt(l.length_weight_nos * l.per_unit_cost)}
                                </td>
                                {receivingMode && (
                                  <td className="px-3.5 py-2.5 bg-accent/5 border-l border-surface-border text-center">
                                    {(l.delivered_qty || 0) >= l.length_weight_nos ? (
                                      <span className="text-[10px] uppercase text-green-500 font-medium">Done</span>
                                    ) : (
                                      <input
                                        type="number"
                                        min="0"
                                        max={l.length_weight_nos - (l.delivered_qty || 0)}
                                        step="any"
                                        value={receiveMap[l.id] || ""}
                                        onChange={(e) => setReceiveMap({...receiveMap, [l.id]: e.target.value})}
                                        className="w-20 rounded border border-surface-border bg-[#0b0f14] px-2 py-1 text-xs text-white text-center outline-none transition focus:border-accent"
                                        placeholder={`Max ${l.length_weight_nos - (l.delivered_qty || 0)}`}
                                      />
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* ── Totals summary ── */}
                  <div className="rounded-xl border border-surface-border bg-[#0f1419] p-5">
                    <div className="space-y-2.5">
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
                      <div className="flex items-center justify-between border-t border-surface-border pt-3 text-lg font-bold text-white">
                        <span>Grand Total</span>
                        <span className="font-mono text-accent">
                          {fmt(detailGrandTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Receiving Actions ── */}
                  {receivingMode && (
                    <div className="flex justify-end pt-2">
                       <button
                         type="button"
                         onClick={handleReceiveSubmit}
                         disabled={receiving}
                         className="flex min-w-[10rem] items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                       >
                         {receiving ? "Processing..." : "Submit Receipt"}
                       </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

        </div>
        {/* end scrollable body */}
      </div>
      )}
    </div>
  );
}
