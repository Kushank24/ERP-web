"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, apiBlob } from "@/lib/api";
import { useSortedData } from "@/lib/useSortedData";
import { SortHeader } from "@/components/SortHeader";

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
  issued_qty: number;
  remaining_qty: number;
};

type WOMaterial = {
  name: string;
  section_size: number;
  unit: string;
  quantity_per_unit: number;
  total_required: number;
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
  remarks: string | null;
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

type FGConflict = {
  product_id: number;
  product_name: string;
  total_stock: number;
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
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── List state ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<WORow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowOffset, setRowOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── Detail state ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── UI visibility ───────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  // ── Issue products to FG ────────────────────────────────────────────────────
  const [issueQtys, setIssueQtys] = useState<Record<number, string>>({});
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // ── PDF download state ─────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ── Delete state ────────────────────────────────────────────────────────
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Sticker state ────────────────────────────────────────────────────────
  const [showStickerBar, setShowStickerBar] = useState(false);
  const [stickerError, setStickerError] = useState<string | null>(null);

  // ── Finished goods overlap confirmation ────────────────────────────────
  const [fgConflicts, setFgConflicts] = useState<FGConflict[]>([]);
  const [showFgConfirm, setShowFgConfirm] = useState(false);
  const pendingSavePayloadRef = useRef<{ method: string; json: object } | null>(null);

  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materials, setMaterials] = useState<WOMaterial[] | null>(null);
  const [materialsLoading, setMaterialsLoading] = useState(false);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [fWONumber, setFWONumber] = useState("");
  const [fPONumber, setFPONumber] = useState("");
  const [fPODate, setFPODate] = useState("");
  const [fPartyName, setFPartyName] = useState("");
  const [fCreationDate, setFCreationDate] = useState("");
  const [fDeliveryDate, setFDeliveryDate] = useState("");
  const [fStatus, setFStatus] = useState<WOStatus>("in-progress");
  const [fRemarks, setFRemarks] = useState("");
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([
    { ...BLANK_DRAFT_PRODUCT },
  ]);

  // ── Load work order list (same fetchPage pattern as Enquiries) ─────────────
  const fetchPage = useCallback((q: string, status: string, off: number, append: boolean) => {
    if (append) setLoadingMore(true); else setListLoading(true);
    setListError(null);
    const params = new URLSearchParams({ limit: "50", offset: String(off) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    api<{ data: WORow[]; total: number }>(`/api/v1/work-orders?${params}`)
      .then(({ data, total: t }) => {
        setRows(prev => append ? [...prev, ...data] : data);
        setTotal(t);
        setRowOffset(off + data.length);
        if (append) setLoadingMore(false); else setListLoading(false);
      })
      .catch((e: Error) => {
        setListError(e.message ?? "Failed to load work orders");
        if (append) setLoadingMore(false); else setListLoading(false);
      });
  }, []);

  const loadList = useCallback(() => {
    fetchPage(searchText, statusFilter, 0, false);
  }, [fetchPage, searchText, statusFilter]);

  // Auto-open a specific WO when navigated from analytics with ?id=N
  useEffect(() => {
    if (listLoading) return;
    const id = searchParams.get("id");
    if (!id) return;
    router.replace("/work-orders");
    setSelectedId(Number(id));
  }, [listLoading, searchParams, router]);

  // ── Load lists for selectors ──────────────────────────────────────────────
  const loadSelectors = useCallback(() => {
    api<{ items: Product[]; total: number }>("/api/v1/products?page=1&page_size=10000")
      .then((data) => setAvailableProducts(data.items))
      .catch(() => {});
    api<Party[]>("/api/v1/work-orders/parties/list")
      .then(setParties)
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPage("", "", 0, false); loadSelectors(); }, [fetchPage, loadSelectors]);

  // Date filter → refetch
  useEffect(() => {
    fetchPage(searchText, statusFilter, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Debounce search → refetch from offset 0
  const woDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (woDebounceRef.current) clearTimeout(woDebounceRef.current);
    woDebounceRef.current = setTimeout(() => {
      setSearchText(searchInput);
      fetchPage(searchInput, statusFilter, 0, false);
    }, 350);
    return () => { if (woDebounceRef.current) clearTimeout(woDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, statusFilter]);

  // ── Load work order detail ──────────────────────────────────────────────────
  const loadDetail = useCallback((id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setCompleteError(null);
    setIssueQtys({});
    setIssueError(null);
    setMaterialsOpen(false);
    setMaterials(null);
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
    setIsEditing(false);
    setFWONumber(""); setFPONumber(""); setFPODate(""); setFPartyName("");
    setFCreationDate(""); setFDeliveryDate(""); setFStatus("in-progress"); setFRemarks("");
    setDraftProducts([{ ...BLANK_DRAFT_PRODUCT }]);
    setIsNewParty(false);
    setShowForm(true);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
    setCompleteError(null);
  }

  function startEdit() {
    if (!detail) return;
    setIsEditing(true);
    setFWONumber(detail.work_order_number);
    setFPONumber(detail.po_number || "");
    setFPODate(detail.po_date ? String(detail.po_date).slice(0, 10) : "");
    setFPartyName(detail.party_name || "");
    setFCreationDate(detail.creation_date ? String(detail.creation_date).slice(0, 10) : "");
    setFDeliveryDate(detail.delivery_date ? String(detail.delivery_date).slice(0, 10) : "");
    setFStatus(detail.status);
    setFRemarks(detail.remarks || "");
    setDraftProducts(
      detail.products.length > 0
        ? detail.products.map((p) => ({ product_id: String(p.product_id), quantity: String(p.quantity) }))
        : [{ ...BLANK_DRAFT_PRODUCT }]
    );
    setIsNewParty(false);
    setSaveError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setIsEditing(false);
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
    setFRemarks("");
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

  const { sorted: filteredRows, sortKey: woSortKey, sortDir: woSortDir, toggleSort: toggleWOSort } =
    useSortedData<WORow>(rows, "work_order_number");

  // ── Shared: perform the actual API save ────────────────────────────────────
  async function doSave(url: string, options: { method: string; json: object }) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api<WODetail>(url, options);
      setIsEditing(false);
      resetFormFields();
      setShowForm(false);
      setSelectedId(saved.id);
      setDetail(saved);
      setDetailError(null);
      loadList();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save work order. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Save work order (create or edit) ───────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);

    const validProducts = draftProducts
      .filter((p) => p.product_id && p.quantity)
      .map((p) => ({
        product_id: parseInt(p.product_id, 10),
        quantity: parseInt(p.quantity, 10) || 0,
      }));

    if (isEditing && selectedId !== null) {
      const payload = {
        work_order_number: fWONumber.trim(),
        po_number: fPONumber.trim() || null,
        po_date: fPODate || null,
        party_name: fPartyName.trim() || null,
        creation_date: fCreationDate || null,
        delivery_date: fDeliveryDate || null,
        remarks: fRemarks.trim() || null,
        products: validProducts,
      };
      await doSave(`/api/v1/work-orders/${selectedId}`, { method: "PATCH", json: payload });
      return;
    }

    // ── Create path: check finished goods overlap first ────────────────────
    const payload = {
      work_order_number: fWONumber.trim(),
      po_number: fPONumber.trim() || null,
      po_date: fPODate || null,
      party_name: fPartyName.trim() || null,
      creation_date: fCreationDate || null,
      delivery_date: fDeliveryDate || null,
      status: fStatus,
      remarks: fRemarks.trim() || null,
      products: validProducts,
    };

    const productIds = validProducts.map((p) => p.product_id);
    if (productIds.length > 0) {
      try {
        const conflicts = await api<FGConflict[]>(
          `/api/v1/work-orders/check-fg-overlap?product_ids=${productIds.join(",")}`,
        );
        if (conflicts.length > 0) {
          setFgConflicts(conflicts);
          pendingSavePayloadRef.current = { method: "POST", json: payload };
          setShowFgConfirm(true);
          return;
        }
      } catch {
        // Non-blocking: if the check fails, proceed with save
      }
    }

    await doSave("/api/v1/work-orders", { method: "POST", json: payload });
  }

  // ── Confirmed create despite FG overlap ────────────────────────────────────
  async function handleFgConfirmProceed() {
    setShowFgConfirm(false);
    if (!pendingSavePayloadRef.current) return;
    const opts = pendingSavePayloadRef.current;
    pendingSavePayloadRef.current = null;
    setFgConflicts([]);
    await doSave("/api/v1/work-orders", opts);
  }

  function handleFgConfirmCancel() {
    setShowFgConfirm(false);
    pendingSavePayloadRef.current = null;
    setFgConflicts([]);
  }

  // ── Delete work order ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/v1/work-orders/${selectedId}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== selectedId));
      setTotal((prev) => prev - 1);
      closePanel();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete work order.");
      setDeleteConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── Generate & print stickers ───────────────────────────────────────────────
  function generateAndPrintStickers() {
    if (!detail) return;
    setStickerError(null);

    if (!detail.products.length) {
      setStickerError("No products on this work order.");
      return;
    }
    const totalStickers = detail.products.reduce((s, p) => s + Math.max(0, Math.round(p.quantity)), 0);
    if (totalStickers === 0) {
      setStickerError("All product quantities are zero.");
      return;
    }
    if (totalStickers > 9999) {
      setStickerError("Total sticker count exceeds 9999. Reduce quantities.");
      return;
    }

    const escHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Build one sticker entry per product-unit. Each product's counter
    // restarts from 1. Barcodes stay globally unique by including the
    // product index (P1, P2, …) in the barcode string.
    type StickerEntry = { id: string; productOf: string; productName: string; barcode: string };
    const stickers: StickerEntry[] = [];
    detail.products.forEach((p, pIdx) => {
      const qty = Math.max(0, Math.round(p.quantity));
      for (let i = 1; i <= qty; i++) {
        const id = `p${pIdx + 1}-${i}`;
        stickers.push({
          id,
          productOf: `${i} of ${qty}`,
          productName: escHtml(p.product_name),
          barcode: `${escHtml(detail.work_order_number)}-P${pIdx + 1}-${String(i).padStart(3, "0")}`,
        });
      }
    });

    const poDate = detail.po_date
      ? new Date(detail.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stickers — ${escHtml(detail.work_order_number)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"><\/script>
<style>
  @page { size: 3in 2in landscape; margin: 1.5mm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111; }
  .grid { display: block; }
  .sticker {
    width: 100%;
    height: calc(2in - 3mm);
    border: 0.6pt solid #bbb;
    border-radius: 2pt;
    padding: 2mm 2.5mm 1.5mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 1mm;
    page-break-after: always;
  }
  .sticker:last-child { page-break-after: avoid; }
  .sticker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .wo-num { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.03em; }
  .serial { font-size: 8.5pt; font-weight: 800; color: #333; }
  .sticker svg { width: 100%; height: 14mm; }
  .divider { border: none; border-top: 0.4pt solid #ddd; }
  .info-row { font-size: 6.5pt; line-height: 1.4; color: #333; }
  .info-row span { font-weight: 600; color: #000; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="grid" id="grid"></div>
<script>
  const stickers = ${JSON.stringify(stickers)};
  const grid = document.getElementById('grid');
  const wo    = ${JSON.stringify(escHtml(detail.work_order_number))};
  const party = ${JSON.stringify(escHtml(detail.party_name ?? "—"))};
  const poNum = ${JSON.stringify(escHtml(detail.po_number ?? ""))};
  const poDate = ${JSON.stringify(poDate)};

  stickers.forEach(s => {
    const d = document.createElement('div');
    d.className = 'sticker';
    d.innerHTML =
      '<div class="sticker-header">' +
        '<span class="wo-num">' + wo + '</span>' +
        '<span class="serial">' + s.productOf + '</span>' +
      '</div>' +
      '<svg id="bc' + s.id + '"></svg>' +
      '<hr class="divider">' +
      '<div class="info-row"><span>Product:</span> ' + s.productName + '</div>' +
      '<div class="info-row"><span>Party:</span> ' + party + '</div>' +
      (poNum  ? '<div class="info-row"><span>PO #:</span> '    + poNum  + '</div>' : '') +
      (poDate ? '<div class="info-row"><span>PO Date:</span> ' + poDate + '</div>' : '');
    grid.appendChild(d);
  });

  stickers.forEach(s => {
    JsBarcode('#bc' + s.id, s.barcode, {
      format: 'CODE128',
      height: 32,
      fontSize: 7,
      margin: 1,
      displayValue: true,
      lineColor: '#000',
      background: '#fff',
    });
  });

  window.addEventListener('load', () => window.print());
<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) {
      setStickerError("Pop-up blocked. Please allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();
    setShowStickerBar(false);
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

  // ── Issue products to Finished Goods ───────────────────────────────────────
  async function handleIssueProducts() {
    if (!detail) return;
    const items = detail.products
      .filter((p) => parseFloat(issueQtys[p.product_id] || "0") > 0)
      .map((p) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        quantity: parseFloat(issueQtys[p.product_id]),
      }));
    if (items.length === 0) {
      setIssueError("Enter a quantity to issue for at least one product.");
      return;
    }
    setIssuing(true);
    setIssueError(null);
    try {
      const updated = await api<WODetail>(`/api/v1/work-orders/${detail.id}/issue-products`, {
        method: "POST",
        json: { items },
      });
      setDetail(updated);
      setIssueQtys({});
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Failed to issue products.");
    } finally {
      setIssuing(false);
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

  const hasMore = rows.length < total;
  const panelOpen = showForm || selectedId !== null;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          fetchPage(searchText, statusFilter, rowOffset, true);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, fetchPage, searchText, statusFilter, rowOffset]);

  function closePanel() {
    setShowForm(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
    setDeleteConfirming(false);
    setDeleteError(null);
    setShowStickerBar(false);
    setStickerError(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
    {/* ── Finished Goods overlap confirmation modal ─────────────────────────── */}
    {showFgConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#151c27] p-6 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 text-xl text-amber-400">⚠</span>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Product already in Finished Goods
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                The following product{fgConflicts.length > 1 ? "s" : ""} already{" "}
                {fgConflicts.length > 1 ? "have" : "has"} existing stock in Finished Goods.
                Do you still want to create this work order?
              </p>
            </div>
          </div>
          <ul className="mb-5 divide-y divide-surface-border/40 rounded-lg border border-surface-border bg-[#0f1419]">
            {fgConflicts.map((c) => (
              <li key={c.product_id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-white">{c.product_name}</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                  {c.total_stock} in stock
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleFgConfirmCancel}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFgConfirmProceed}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  Creating…
                </>
              ) : (
                "Yes, create anyway"
              )}
            </button>
          </div>
        </div>
      </div>
    )}
    <div
      className="flex h-[calc(100vh-7rem)] min-h-0 gap-5"
      style={{ background: "var(--color-bg-base)" }}
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
                : `${rows.length} of ${total} order${total !== 1 ? "s" : ""}`}
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

        {/* Search + status filter */}
        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-1.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-slate-500">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3 w-3"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
                </span>
                <input type="search" value={searchInput} placeholder="Search WO #, PO #, party…"
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full rounded border border-surface-border/60 bg-[#0b0f14] py-1 pl-7 pr-2 text-[11px] text-white placeholder-slate-600 outline-none transition focus:border-accent/50" />
              </div>
              <select value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded border border-surface-border/60 bg-[#0b0f14] px-1.5 py-1 text-[11px] text-slate-300 outline-none transition focus:border-accent/50">
                <option value="">All statuses</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">Date:</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="cursor-pointer rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-0.5 text-[11px] text-slate-300 outline-none transition focus:border-accent/50 [color-scheme:dark]" />
              <span className="text-[10px] text-slate-600">–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="cursor-pointer rounded border border-surface-border/60 bg-[#0b0f14] px-2 py-0.5 text-[11px] text-slate-300 outline-none transition focus:border-accent/50 [color-scheme:dark]" />
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-[10px] text-slate-500 hover:text-white">✕ Clear</button>
              )}
            </div>
          </div>
        </div>

        {/* Column header bar */}
        <div className="shrink-0 border-b border-surface-border/50 bg-[#0f1419]/60 px-4 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_6rem] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <SortHeader label="WO #" colKey="work_order_number" currentKey={woSortKey as string} currentDir={woSortDir} onSort={k => toggleWOSort(k as keyof WORow)} />
            <SortHeader label="PO #" colKey="po_number" currentKey={woSortKey as string} currentDir={woSortDir} onSort={k => toggleWOSort(k as keyof WORow)} />
            <SortHeader label="Party" colKey="party_name" currentKey={woSortKey as string} currentDir={woSortDir} onSort={k => toggleWOSort(k as keyof WORow)} />
            <SortHeader label="Status" colKey="status" currentKey={woSortKey as string} currentDir={woSortDir} onSort={k => toggleWOSort(k as keyof WORow)} />
            <SortHeader label="Delivery" colKey="delivery_date" currentKey={woSortKey as string} currentDir={woSortDir} onSort={k => toggleWOSort(k as keyof WORow)} className="justify-end" />
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
              {(searchInput || statusFilter) ? "No orders match the search." : "No work orders found."}
            </div>
          ) : (
            <>
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
            {hasMore && (
              <div ref={sentinelRef} className="py-4 text-center text-xs text-slate-500">
                {loadingMore ? "Loading…" : ""}
              </div>
            )}
            </>
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
                {isEditing ? "Edit Work Order" : "New Work Order"}
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
                        disabled={isEditing}
                        className={isEditing ? "opacity-60 cursor-not-allowed" : ""}
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

                {/* ── Remarks ── */}
                <div>
                  <SectionHeading>Remarks</SectionHeading>
                  <textarea
                    value={fRemarks}
                    onChange={(e) => setFRemarks(e.target.value)}
                    placeholder="Optional notes or remarks…"
                    rows={3}
                    className="mt-3 w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20 resize-none"
                  />
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
                  ) : isEditing ? (
                    "Update Work Order"
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
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
                >
                  Edit
                </button>
                {/* Delete — two-step inline confirm */}
                {!deleteConfirming ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirming(true)}
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleting ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Deleting…
                        </>
                      ) : (
                        "Confirm delete"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirming(false); setDeleteError(null); }}
                      className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
                <button
                  type="button"
                  onClick={() => { setShowStickerBar((v) => !v); setStickerError(null); }}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${showStickerBar ? "border-violet-500/60 bg-violet-500/15 text-violet-300" : "border-surface-border text-slate-300 hover:border-slate-400 hover:text-white"}`}
                >
                  🏷 Stickers
                </button>
              </div>
            </div>

            {/* ── Sticker bar ───────────────────────────────────────────────── */}
            {showStickerBar && detail && (
              <div className="shrink-0 border-b border-surface-border/60 bg-violet-500/5 px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-semibold text-violet-300">Print stickers</span>
                  {detail.products.length > 0 && (
                    <span className="text-[11px] text-slate-400">
                      {detail.products.map((p) => (
                        <span key={p.product_id} className="mr-2">
                          <span className="text-slate-300">{p.product_name}</span>
                          <span className="ml-1 text-violet-400">×{p.quantity}</span>
                        </span>
                      ))}
                      <span className="text-slate-600">
                        ({detail.products.reduce((s, p) => s + Math.max(0, Math.round(p.quantity)), 0)} total)
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={generateAndPrintStickers}
                    className="rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 transition-colors"
                  >
                    Generate &amp; Print
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowStickerBar(false); setStickerError(null); }}
                    className="text-[11px] text-slate-500 hover:text-white"
                  >
                    Cancel
                  </button>
                  {stickerError && (
                    <span className="text-[11px] text-red-400">{stickerError}</span>
                  )}
                </div>
              </div>
            )}

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
              {deleteError && (
                <div className="mb-4">
                  <ErrorAlert message={deleteError} />
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

                  {/* ── Remarks ── */}
                  {detail.remarks && (
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Remarks
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{detail.remarks}</p>
                    </div>
                  )}

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
                              {["Product Name", "Required", "Issued", "Remaining"].map((h) => (
                                <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border/40">
                            {detail.products.map((p, i) => {
                              const allIssued = p.remaining_qty <= 0;
                              const partialIssued = p.issued_qty > 0 && !allIssued;
                              return (
                                <tr key={p.product_id ?? i} className="transition-colors hover:bg-white/[0.02]">
                                  <td className="px-4 py-3 text-sm text-white">{p.product_name}</td>
                                  <td className="px-4 py-3 font-mono text-sm text-slate-300">{p.quantity}</td>
                                  <td className="px-4 py-3 font-mono text-sm">
                                    <span className={p.issued_qty > 0 ? "text-emerald-400" : "text-slate-600"}>
                                      {p.issued_qty}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-sm">
                                    <span className={allIssued ? "text-emerald-400" : partialIssued ? "text-amber-400" : "text-slate-400"}>
                                      {allIssued ? "✓ Done" : p.remaining_qty}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* ── Material Requirements (lazy-loaded toggle) ── */}
                  <div>
                    <button
                      className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-[#0f1419]/60 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                      onClick={() => {
                        const next = !materialsOpen;
                        setMaterialsOpen(next);
                        if (next && materials === null && !materialsLoading) {
                          setMaterialsLoading(true);
                          api<WOMaterial[]>(`/api/v1/work-orders/${detail.id}/materials`)
                            .then((data) => { setMaterials(data); setMaterialsLoading(false); })
                            .catch(() => { setMaterials([]); setMaterialsLoading(false); });
                        }
                      }}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Material Requirements
                      </span>
                      <span className="text-xs text-slate-500">{materialsOpen ? "▲ Hide" : "▼ Show"}</span>
                    </button>

                    {materialsOpen && (
                      <div className="mt-2 overflow-hidden rounded-lg border border-surface-border">
                        {materialsLoading ? (
                          <p className="px-4 py-6 text-center text-xs text-slate-500">Loading materials…</p>
                        ) : !materials || materials.length === 0 ? (
                          <p className="px-4 py-6 text-center text-xs text-slate-500">No material requirements found.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead className="border-b border-surface-border bg-[#0f1419]/70">
                                <tr>
                                  {["Material", "Section Size", "Unit", "Qty / Unit", "Total Required"].map((h) => (
                                    <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-border/40">
                                {materials.map((m, i) => (
                                  <tr key={i} className="transition-colors hover:bg-white/[0.02]">
                                    <td className="px-4 py-3 text-sm text-white">{m.name}</td>
                                    <td className="px-4 py-3 font-mono text-sm text-slate-300">
                                      {m.section_size > 0 ? m.section_size : "-"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{m.unit}</td>
                                    <td className="px-4 py-3 font-mono text-sm text-slate-300">{m.quantity_per_unit}</td>
                                    <td className="px-4 py-3 font-mono text-sm text-slate-300">{m.total_required}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Issue to Finished Goods panel (in-progress only) ── */}
                  {detail.status === "in-progress" && detail.products.some((p) => p.remaining_qty > 0) && (
                    <div className="rounded-xl border border-surface-border bg-[#0f1419] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Issue to Finished Goods
                      </p>
                      {issueError && (
                        <div className="mb-3">
                          <ErrorAlert message={issueError} />
                        </div>
                      )}
                      <div className="space-y-2">
                        {detail.products
                          .filter((p) => p.remaining_qty > 0)
                          .map((p) => (
                            <div key={p.product_id} className="grid grid-cols-[1fr_auto_10rem] items-center gap-3">
                              <span className="truncate text-xs text-slate-300">
                                {p.product_name}
                                <span className="ml-1.5 text-slate-600">(remaining: {p.remaining_qty})</span>
                              </span>
                              <span className="text-[10px] text-slate-600">Qty to issue</span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max={p.remaining_qty}
                                placeholder={`0 – ${p.remaining_qty}`}
                                value={issueQtys[p.product_id] ?? ""}
                                onChange={(e) =>
                                  setIssueQtys((prev) => ({ ...prev, [p.product_id]: e.target.value }))
                                }
                                className="w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/20"
                              />
                            </div>
                          ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={handleIssueProducts}
                          disabled={issuing}
                          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {issuing ? (
                            <>
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                              Issuing…
                            </>
                          ) : (
                            "Issue to Finished Goods"
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* All products issued banner */}
                  {detail.status === "in-progress" && detail.products.length > 0 && detail.products.every((p) => p.remaining_qty <= 0) && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                      <span>✓</span>
                      <span>All products have been issued to Finished Goods.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

      </div>
      )}
    </div>
    </>
  );
}
