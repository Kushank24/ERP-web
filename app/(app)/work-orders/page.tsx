"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { api, apiBlob } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WOStatus = "in-progress" | "completed";

type WORow = {
  id: number;
  work_order_number: string;
  po_number: string | null;
  party_name: string | null;
  status: WOStatus;
  delivery_date: string | null;
  creation_date: string | null;
};

type WOProduct = {
  product_id: number;
  product_name: string;
  quantity: number;
};

type WODetail = {
  id: number;
  work_order_number: string;
  po_number: string | null;
  po_date: string | null;
  party_name: string | null;
  creation_date: string | null;
  delivery_date: string | null;
  status: WOStatus;
  products: WOProduct[];
};

type Product = {
  id: number;
  name: string;
  product_code: string | null;
};

type Party = {
  party_name: string;
};

type DraftProduct = {
  product_id: string;
  quantity: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_DRAFT_PRODUCT: DraftProduct = {
  product_id: "",
  quantity: "",
};

const STATUS_OPTIONS: WOStatus[] = ["in-progress", "completed"];

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WOStatus }) {
  const cfg =
    status === "completed"
      ? {
          label: "Completed",
          classes: "bg-green-500/15 text-green-400 border-green-500/30",
        }
      : {
          label: "In Progress",
          classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        };

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cfg.classes}`}
    >
      {cfg.label}
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

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  // ── List state ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<WORow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState({ wo: "", po: "", party: "", status: "" });

  // ── Detail state ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── UI visibility ───────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);

  // ── Selectors Data ────────────────────────────────────────────────────────
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isNewParty, setIsNewParty] = useState(false);

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Completing status ───────────────────────────────────────────────────────
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // ── PDF download state ─────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [fWONumber, setFWONumber] = useState("");
  const [fPONumber, setFPONumber] = useState("");
  const [fPODate, setFPODate] = useState("");
  const [fPartyName, setFPartyName] = useState("");
  const [fCreationDate, setFCreationDate] = useState("");
  const [fDeliveryDate, setFDeliveryDate] = useState("");
  const [fStatus, setFStatus] = useState<WOStatus>("in-progress");
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([
    { ...BLANK_DRAFT_PRODUCT },
  ]);

  // ── Load work order list ────────────────────────────────────────────────────
  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    api<WORow[]>("/api/v1/work-orders")
      .then((data) => {
        setRows(data);
        setListLoading(false);
      })
      .catch((e: Error) => {
        setListError(e.message ?? "Failed to load work orders");
        setListLoading(false);
      });
  }, []);

  // ── Load lists for selectors ──────────────────────────────────────────────
  const loadSelectors = useCallback(() => {
    api<Product[]>("/api/v1/products")
      .then(setAvailableProducts)
      .catch(() => {});
    api<Party[]>("/api/v1/work-orders/parties/list")
      .then(setParties)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadList();
    loadSelectors();
  }, [loadList, loadSelectors]);

  // ── Load work order detail ──────────────────────────────────────────────────
  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setCompleteError(null);
    api<WODetail>(`/api/v1/work-orders/${id}`)
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((e: Error) => {
        setDetailError(e.message ?? "Failed to load work order details");
        setDetailLoading(false);
      });
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
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
    setCompleteError(null);
  }

  function closeForm() {
    setShowForm(false);
    setSaveError(null);
  }

  function resetFormFields() {
    setFWONumber("");
    setFPONumber("");
    setFPODate("");
    setFPartyName("");
    setFCreationDate("");
    setFDeliveryDate("");
    setFStatus("in-progress");
    setDraftProducts([{ ...BLANK_DRAFT_PRODUCT }]);
  }

  // ── Draft products helpers ──────────────────────────────────────────────────
  function updateDraftProduct(idx: number, patch: Partial<DraftProduct>) {
    setDraftProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }

  function addDraftProduct() {
    setDraftProducts((prev) => [...prev, { ...BLANK_DRAFT_PRODUCT }]);
  }

  function removeDraftProduct(idx: number) {
    setDraftProducts((prev) => prev.filter((_, i) => i !== idx));
  }

  const filteredRows = rows.filter((r) => {
    if (colFilters.wo && !r.work_order_number.toLowerCase().includes(colFilters.wo.toLowerCase())) return false;
    if (colFilters.po && !(r.po_number ?? "").toLowerCase().includes(colFilters.po.toLowerCase())) return false;
    if (colFilters.party && !(r.party_name ?? "").toLowerCase().includes(colFilters.party.toLowerCase())) return false;
    if (colFilters.status && r.status !== colFilters.status) return false;
    return true;
  });

  // ── Save new work order ─────────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      const validProducts = draftProducts
        .filter((p) => p.product_id && p.quantity)
        .map((p) => ({
          product_id: parseInt(p.product_id, 10),
          quantity: parseInt(p.quantity, 10) || 0,
        }));

      const payload = {
        work_order_number: fWONumber.trim(),
        po_number: fPONumber.trim() || null,
        po_date: fPODate || null,
        party_name: fPartyName.trim() || null,
        creation_date: fCreationDate || null,
        delivery_date: fDeliveryDate || null,
        status: fStatus,
        products: validProducts,
      };

      const created = await api<WODetail>("/api/v1/work-orders", {
        method: "POST",
        json: payload,
      });

      resetFormFields();
      setShowForm(false);

      // Show the newly created WO in the detail panel
      setSelectedId(created.id);
      setDetail(created);
      setDetailError(null);

      // Refresh list
      loadList();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save work order. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Mark as complete ────────────────────────────────────────────────────────
  async function handleMarkComplete() {
    if (!selectedId || !detail) return;
    setCompleting(true);
    setCompleteError(null);

    try {
      await api(`/api/v1/work-orders/${selectedId}/status`, {
        method: "PATCH",
        json: { status: "completed" },
      });

      // Update local detail state
      setDetail((prev) => (prev ? { ...prev, status: "completed" } : prev));

      // Update list row status
      setRows((prev) =>
        prev.map((r) =>
          r.id === selectedId ? { ...r, status: "completed" } : r,
        ),
      );
    } catch (err) {
      setCompleteError(
        err instanceof Error
          ? err.message
          : "Failed to update status. Please try again.",
      );
    } finally {
      setCompleting(false);
    }
  }

  // ── PDF download ──────────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    if (!detail) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const { blob, filename } = await apiBlob(
        `/api/v1/work-orders/${detail.id}/pdf`,
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

  const panelOpen = showForm || selectedId !== null;

  function closePanel() {
    setShowForm(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-[calc(100vh-7rem)] min-h-0 gap-5"
      style={{ background: "#0b0f14" }}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Work Order List (40%)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className={`flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all duration-300 ease-in-out ${panelOpen ? "w-[38%]" : "w-full"}`}>
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Work Orders</h2>
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
              className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_6rem] items-center gap-2">
            <input type="search" value={colFilters.wo} placeholder="WO #…"
              onChange={e => setColFilters(p => ({ ...p, wo: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <input type="search" value={colFilters.po} placeholder="PO #…"
              onChange={e => setColFilters(p => ({ ...p, po: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <input type="search" value={colFilters.party} placeholder="Party…"
              onChange={e => setColFilters(p => ({ ...p, party: e.target.value }))}
              className="w-full rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-1 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
            <select value={colFilters.status}
              onChange={e => setColFilters(p => ({ ...p, status: e.target.value }))}
              className="rounded border border-surface-border/60 bg-[#0b0f14] px-1.5 py-1 text-[11px] text-slate-300 outline-none transition focus:border-accent/50">
              <option value="">All</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
            <div />
          </div>
        </div>

        {/* Column header bar */}
        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_6rem] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            <span>WO #</span>
            <span>PO #</span>
            <span>Party</span>
            <span>Status</span>
            <span className="text-right">Delivery</span>
          </div>
        </div>

        {/* Scrollable row list */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg px-2 py-3"
                >
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 && !listError ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {(colFilters.wo || colFilters.po || colFilters.party || colFilters.status) ? "No orders match the active filters." : "No work orders found."}
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
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_6rem] items-center gap-2">
                        <span
                          className={`truncate text-xs font-semibold ${
                            isActive ? "text-accent" : "text-white"
                          }`}
                        >
                          {row.work_order_number}
                        </span>
                        <span className="truncate text-xs text-slate-400">
                          {row.po_number ?? "—"}
                        </span>
                        <span className="truncate text-xs text-slate-400">
                          {row.party_name ?? "—"}
                        </span>
                        <StatusBadge status={row.status} />
                        <span className="text-right text-[10px] text-slate-500">
                          {fmtDate(row.delivery_date)}
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

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — slides in when a row is selected or form is open
      ══════════════════════════════════════════════════════════════════════ */}
      {panelOpen && (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        {/* ── CREATE FORM ─────────────────────────────────────────────────────── */}
        {showForm && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
              <h2 className="text-sm font-semibold text-white">
                New Work Order
              </h2>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <form id="wo-form" onSubmit={handleSave} className="space-y-6">
                {/* ── Order Info ── */}
                <div>
                  <SectionHeading>Order Information</SectionHeading>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <FormField label="WO Number" required>
                      <Input
                        placeholder="WO-2024-001"
                        value={fWONumber}
                        onChange={(e) => setFWONumber(e.target.value)}
                        required
                      />
                    </FormField>

                    <FormField label="PO Number">
                      <Input
                        placeholder="PO-2024-001"
                        value={fPONumber}
                        onChange={(e) => setFPONumber(e.target.value)}
                      />
                    </FormField>

                    <FormField label="PO Date">
                      <Input
                        type="date"
                        value={fPODate}
                        onChange={(e) => setFPODate(e.target.value)}
                      />
                    </FormField>

                    <FormField label="Party Name">
                      {!isNewParty ? (
                        <select
                          required
                          value={fPartyName}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "___NEW___") {
                              setIsNewParty(true);
                              setFPartyName("");
                            } else {
                              setFPartyName(val);
                            }
                          }}
                          className="w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
                        >
                          <option value="">-- Select Party --</option>
                          <option value="___NEW___">+ Add New Party</option>
                          {parties.map((p) => (
                            <option key={p.party_name} value={p.party_name}>{p.party_name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            value={fPartyName}
                            onChange={(e) => setFPartyName(e.target.value)}
                            placeholder="Party Name"
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsNewParty(false);
                              setFPartyName("");
                            }}
                            className="shrink-0 rounded p-1 text-slate-500 hover:bg-surface-border/50 hover:text-white"
                            title="Cancel new party"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </FormField>

                    <FormField label="Creation Date">
                      <Input
                        type="date"
                        value={fCreationDate}
                        onChange={(e) => setFCreationDate(e.target.value)}
                      />
                    </FormField>

                    <FormField label="Delivery Date">
                      <Input
                        type="date"
                        value={fDeliveryDate}
                        onChange={(e) => setFDeliveryDate(e.target.value)}
                      />
                    </FormField>

                    <FormField label="Status" required>
                      <Select
                        value={fStatus}
                        onChange={(e) => setFStatus(e.target.value as WOStatus)}
                        required
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s === "in-progress" ? "In Progress" : "Completed"}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                </div>

                {/* ── Products ── */}
                <div>
                  <div className="flex items-center justify-between">
                    <SectionHeading>Products</SectionHeading>
                    <button
                      type="button"
                      onClick={addDraftProduct}
                      className="flex items-center gap-1 text-[11px] text-accent hover:text-blue-300 transition-colors"
                    >
                      + Add product
                    </button>
                  </div>

                  {draftProducts.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-600">
                      No products added. Click "+ Add product" to begin.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {/* Column labels */}
                      <div className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        <span>Product</span>
                        <span>Quantity</span>
                        <span />
                      </div>

                      {draftProducts.map((dp, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2"
                        >
                          <Select
                            value={dp.product_id}
                            onChange={(e) =>
                              updateDraftProduct(idx, {
                                product_id: e.target.value,
                              })
                            }
                          >
                            <option value="">— select product —</option>
                            {availableProducts.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.name}
                                {p.product_code ? ` (${p.product_code})` : ""}
                              </option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Qty"
                            value={dp.quantity}
                            onChange={(e) =>
                              updateDraftProduct(idx, {
                                quantity: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeDraftProduct(idx)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Save error ── */}
                {saveError && <ErrorAlert message={saveError} />}
              </form>
            </div>

            {/* Footer action */}
            <div className="shrink-0 border-t border-surface-border px-5 py-3">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="wo-form"
                  disabled={saving || !fWONumber.trim()}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving…
                    </>
                  ) : (
                    "Save Work Order"
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── DETAIL VIEW ─────────────────────────────────────────────────────── */}
        {!showForm && selectedId !== null && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-white">
                  {detail?.work_order_number ?? "Work Order"}
                </h2>
                {detail && <StatusBadge status={detail.status} />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                  title="Close panel"
                >
                  ✕
                </button>
                {detail?.status === "in-progress" && (
                  <button
                    type="button"
                    onClick={handleMarkComplete}
                    disabled={completing}
                    className="flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {completing ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-green-400/30 border-t-green-400" />
                        Updating…
                      </>
                    ) : (
                      <>✓ Mark Complete</>
                    )}
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

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detailLoading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-2.5 w-20" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 space-y-2">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              )}

              {detailError && <ErrorAlert message={detailError} />}

              {completeError && (
                <div className="mb-4">
                  <ErrorAlert message={completeError} />
                </div>
              )}
              {pdfError && (
                <div className="mb-4">
                  <ErrorAlert message={pdfError} />
                </div>
              )}

              {detail && !detailLoading && (
                <div className="space-y-6">
                  {/* ── Core fields ── */}
                  <div>
                    <SectionHeading>Order Information</SectionHeading>
                    <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
                      <DetailField label="WO Number">
                        {detail.work_order_number}
                      </DetailField>
                      <DetailField label="PO Number">
                        {detail.po_number ?? "—"}
                      </DetailField>
                      <DetailField label="PO Date">
                        {fmtDate(detail.po_date)}
                      </DetailField>
                      <DetailField label="Party Name">
                        {detail.party_name ?? "—"}
                      </DetailField>
                      <DetailField label="Creation Date">
                        {fmtDate(detail.creation_date)}
                      </DetailField>
                      <DetailField label="Delivery Date">
                        {fmtDate(detail.delivery_date)}
                      </DetailField>
                      <DetailField label="Status">
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge status={detail.status} />
                        </span>
                      </DetailField>
                    </div>
                  </div>

                  {/* ── Products table ── */}
                  <div>
                    <SectionHeading>
                      Products ({detail.products?.length ?? 0})
                    </SectionHeading>
                    {!detail.products || detail.products.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-600">
                        No products attached to this work order.
                      </p>
                    ) : (
                      <div className="mt-3 overflow-hidden rounded-lg border border-surface-border">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-surface-border bg-[#0f1419]/70">
                            <tr>
                              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Product Name
                              </th>
                              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Quantity
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border/40">
                            {detail.products.map((p, i) => (
                              <tr
                                key={p.product_id ?? i}
                                className="transition-colors hover:bg-white/[0.02]"
                              >
                                <td className="px-4 py-3 text-sm text-white">
                                  {p.product_name}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-slate-300">
                                  {p.quantity}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      </div>
      )}
    </div>
  );
}
