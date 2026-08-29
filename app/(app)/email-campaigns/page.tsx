"use client";

import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from "react";
import { api, apiFormData, API } from "@/lib/api";
import { RichTextEditor } from "@/components/RichTextEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: number;
  subject: string;
  reply_to: string | null;
  cc: string | null;
  bcc: string | null;
  status: "running" | "completed" | "stopped" | "failed";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
};

type Contact = { name: string; email: string };
type ActiveStatus = { running: boolean; campaign: Campaign | null };
type RecipientTab = "erp" | "manual" | "file";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<Campaign["status"], string> = {
  running:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  stopped:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  failed:    "bg-red-500/15 text-red-400 border-red-500/30",
};

function StatusBadge({ status }: { status: Campaign["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border/40">
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

const input = "w-full rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-2 text-sm text-white outline-none focus:border-accent/50 placeholder-slate-600";
const sectionCard = "rounded-xl border border-surface-border bg-surface-card";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  // ── list + active ────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [active, setActive] = useState<ActiveStatus>({ running: false, campaign: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── compose fields ───────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY);
  const [replyTo, setReplyTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");

  // ── recipients ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<RecipientTab>("erp");
  const [erpContacts, setErpContacts] = useState<Contact[]>([]);
  const [erpSelected, setErpSelected] = useState<Set<string>>(new Set());
  const [erpSearch, setErpSearch] = useState("");
  const [manualText, setManualText] = useState("");
  const [fileEmails, setFileEmails] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileParsing, setFileParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── send state ───────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  // ── data loaders ─────────────────────────────────────────────────────────
  const loadList = useCallback(() => {
    api<Campaign[]>("/api/v1/email-campaigns")
      .then(d => { setCampaigns(d); setListLoading(false); })
      .catch(() => setListLoading(false));
  }, []);

  const loadActive = useCallback(() => {
    api<ActiveStatus>("/api/v1/email-campaigns/active")
      .then(d => {
        setActive(d);
        if (!d.running) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          loadList();
        }
      })
      .catch(() => {});
  }, [loadList]);

  useEffect(() => {
    loadList();
    loadActive();
    api<Contact[]>("/api/v1/email-campaigns/contacts")
      .then(d => {
        setErpContacts(d);
        setErpSelected(new Set(d.map(c => c.email)));
      })
      .catch(() => {});
  }, [loadList, loadActive]);

  useEffect(() => {
    if (active.running && !pollRef.current) {
      pollRef.current = setInterval(loadActive, 3000);
    }
  }, [active.running, loadActive]);

  // ── file upload ──────────────────────────────────────────────────────────
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setFileParsing(true);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiFormData<{ emails: string[]; count: number }>(
        "/api/v1/email-campaigns/parse-contacts",
        formData,
      );
      setFileEmails(data.emails);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to parse file.");
      setFileEmails([]);
    } finally {
      setFileParsing(false);
    }
  }

  // ── recipient build ───────────────────────────────────────────────────────
  const allRecipients: string[] = (() => {
    const set = new Set<string>();
    if (tab === "erp") {
      erpSelected.forEach(e => set.add(e));
    } else if (tab === "manual") {
      manualText.split(/[\n,;]+/).forEach(e => {
        const t = e.trim().toLowerCase();
        if (t.includes("@")) set.add(t);
      });
    } else if (tab === "file") {
      fileEmails.forEach(e => set.add(e));
    }
    return Array.from(set);
  })();

  const filteredErp = erpSearch
    ? erpContacts.filter(c =>
        c.name.toLowerCase().includes(erpSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(erpSearch.toLowerCase())
      )
    : erpContacts;

  function toggleErp(email: string) {
    setErpSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }
  function selectAllErp() { setErpSelected(new Set(filteredErp.map(c => c.email))); }
  function clearAllErp()  { setErpSelected(new Set()); }

  // ── send ─────────────────────────────────────────────────────────────────
  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (allRecipients.length === 0 || !subject.trim()) return;
    if (!confirm(`Send "${subject}" to ${allRecipients.length} recipient(s)?`)) return;
    setSending(true);
    setSendError(null);
    try {
      await api("/api/v1/email-campaigns", {
        method: "POST",
        json: {
          subject,
          body_html: bodyHtml,
          recipients: allRecipients,
          reply_to: replyTo.trim() || null,
          cc: cc.trim() || null,
          bcc: bcc.trim() || null,
        },
      });
      loadActive();
      if (!pollRef.current) pollRef.current = setInterval(loadActive, 3000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to start campaign.");
    } finally {
      setSending(false);
    }
  }

  async function uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const data = await apiFormData<{ url: string }>(
      "/api/v1/email-campaigns/upload-image",
      formData,
    );
    // data.url is a relative path; prepend the backend base so the browser
    // can display the image in the editor preview
    return `${API.replace(/\/$/, "")}${data.url}`;
  }

  async function handleDeleteCampaign(id: number) {
    if (!confirm("Delete this campaign record?")) return;
    try {
      await api(`/api/v1/email-campaigns/${id}`, { method: "DELETE" });
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleStop() {
    if (!confirm("Stop the running campaign?")) return;
    setStopping(true);
    try {
      await api(`/api/v1/email-campaigns/${active.campaign?.id}/stop`, { method: "POST" });
      setTimeout(loadActive, 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Stop failed.");
    } finally {
      setStopping(false);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Email Campaigns</h1>
        <p className="mt-1 text-sm text-slate-500">Compose and send bulk emails via SMTP.</p>
      </div>

      {/* ── Active campaign banner ── */}
      {active.campaign && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">{active.campaign.subject}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {active.running ? "Sending in progress…" : `Finished · ${fmtDate(active.campaign.completed_at)}`}
                <span className="ml-2"><StatusBadge status={active.campaign.status} /></span>
              </p>
            </div>
            {active.running && (
              <button onClick={handleStop} disabled={stopping}
                className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-400 disabled:opacity-50">
                {stopping ? "Stopping…" : "Stop Campaign"}
              </button>
            )}
          </div>
          <ProgressBar value={active.campaign.sent_count} total={active.campaign.total_recipients} />
          <div className="mt-2 flex flex-wrap gap-6 text-[11px] text-slate-400">
            <span>Total <span className="font-semibold text-white">{active.campaign.total_recipients}</span></span>
            <span>Sent <span className="font-semibold text-emerald-400">{active.campaign.sent_count}</span></span>
            <span>Failed <span className="font-semibold text-red-400">{active.campaign.failed_count}</span></span>
            <span>Remaining <span className="font-semibold text-slate-300">{Math.max(0, active.campaign.total_recipients - active.campaign.sent_count - active.campaign.failed_count)}</span></span>
          </div>
        </div>
      )}

      {/* ── Compose form ── */}
      {!active.running && (
        <form onSubmit={handleSend} className="space-y-5">
          {sendError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">⚠ {sendError}</div>
          )}

          {/* ── 1. Recipients ── */}
          <div className={sectionCard}>
            <div className="border-b border-surface-border px-5 py-3">
              <h2 className="text-sm font-semibold text-white">1 · Recipients</h2>
            </div>
            <div className="p-5">
              {/* Tab switcher */}
              <div className="mb-4 flex gap-2">
                {([["erp", "ERP Companies"], ["manual", "Enter Emails"], ["file", "Upload File"]] as [RecipientTab, string][]).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setTab(id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      tab === id ? "border-accent bg-accent/10 text-accent" : "border-surface-border text-slate-400 hover:border-slate-500 hover:text-white"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ERP tab */}
              {tab === "erp" && (
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <input type="search" value={erpSearch} onChange={e => setErpSearch(e.target.value)}
                      placeholder="Search name or email…"
                      className="flex-1 rounded-lg border border-surface-border bg-[#0b0f14] px-3 py-1.5 text-xs text-white outline-none focus:border-accent/50 placeholder-slate-600" />
                    <button type="button" onClick={selectAllErp} className="text-[11px] text-accent hover:underline">Select all</button>
                    <button type="button" onClick={clearAllErp} className="text-[11px] text-slate-500 hover:text-white hover:underline">Clear</button>
                  </div>
                  {erpContacts.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-600">No company emails found in ERP.</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-surface-border/50">
                      {filteredErp.map(c => (
                        <label key={c.email} className="flex cursor-pointer items-center gap-3 border-b border-surface-border/30 px-3 py-2 last:border-b-0 hover:bg-white/[0.03]">
                          <input type="checkbox" checked={erpSelected.has(c.email)}
                            onChange={() => toggleErp(c.email)}
                            className="h-3.5 w-3.5 rounded accent-accent" />
                          <span className="flex-1 text-xs text-white">{c.name}</span>
                          <span className="text-[11px] text-slate-500">{c.email}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Manual tab */}
              {tab === "manual" && (
                <div>
                  <label className="mb-1.5 block text-xs text-slate-500">One email per line, or comma/semicolon separated</label>
                  <textarea rows={8} value={manualText} onChange={e => setManualText(e.target.value)}
                    className={`${input} resize-y text-xs font-mono`}
                    placeholder={"alice@example.com\nbob@example.com\ncarol@example.com"} />
                </div>
              )}

              {/* File upload tab */}
              {tab === "file" && (
                <div>
                  <label className="mb-2 block text-xs text-slate-500">
                    Upload a CSV or Excel (.xlsx) file. The file must have an <strong className="text-slate-300">email</strong> column header (or put emails in the first column).
                  </label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="rounded-lg border border-surface-border px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-400 hover:text-white">
                      {fileParsing ? "Parsing…" : "Choose file"}
                    </button>
                    {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={handleFileChange} />
                  </div>
                  {fileError && <p className="mt-2 text-xs text-red-400">⚠ {fileError}</p>}
                  {fileEmails.length > 0 && (
                    <p className="mt-2 text-xs text-emerald-400">✓ {fileEmails.length} valid emails found in file.</p>
                  )}
                </div>
              )}

              <p className="mt-3 text-xs font-medium text-slate-400">
                <span className="text-white">{allRecipients.length}</span> unique recipient{allRecipients.length !== 1 ? "s" : ""} selected
              </p>
            </div>
          </div>

          {/* ── 2. Addressing ── */}
          <div className={sectionCard}>
            <div className="border-b border-surface-border px-5 py-3">
              <h2 className="text-sm font-semibold text-white">2 · Addressing</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Reply-To</label>
                <input type="email" value={replyTo} onChange={e => setReplyTo(e.target.value)}
                  className={input} placeholder="replies@esafe.co.in (optional)" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  BCC <span className="text-slate-600 font-normal">— added to every email</span>
                </label>
                <input type="text" value={bcc} onChange={e => setBcc(e.target.value)}
                  className={input} placeholder="monitor@esafe.co.in (optional)" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  CC <span className="text-slate-600 font-normal">— added to every email</span>
                </label>
                <input type="text" value={cc} onChange={e => setCc(e.target.value)}
                  className={input} placeholder="cc@esafe.co.in, another@esafe.co.in (optional)" />
              </div>
            </div>
          </div>

          {/* ── 3. Compose ── */}
          <div className={sectionCard}>
            <div className="border-b border-surface-border px-5 py-3">
              <h2 className="text-sm font-semibold text-white">3 · Compose</h2>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Subject <span className="text-red-400">*</span></label>
                <input type="text" required value={subject} onChange={e => setSubject(e.target.value)}
                  className={input} placeholder="e.g. Happy Diwali from E-Safe! 🪔" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Email Body <span className="text-red-400">*</span></label>
                <RichTextEditor
                  initialContent={DEFAULT_BODY}
                  onChange={setBodyHtml}
                  placeholder="Write your email body here…"
                  uploadImage={uploadImage}
                />
              </div>
            </div>
          </div>

          {/* ── 4. Send ── */}
          <div className={`${sectionCard} p-5`}>
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-400">
                Sending to <span className="font-semibold text-white">{allRecipients.length}</span> recipient{allRecipients.length !== 1 ? "s" : ""}
                {bcc && <span className="ml-2 text-[11px] text-slate-600">· BCC: {bcc}</span>}
                {cc && <span className="ml-2 text-[11px] text-slate-600">· CC: {cc}</span>}
              </div>
              <button type="submit"
                disabled={sending || allRecipients.length === 0 || !subject.trim() || bodyHtml.replace(/<[^>]+>/g, "").trim() === ""}
                className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {sending ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Starting…</>
                ) : (
                  `Send Campaign`
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Campaign history ── */}
      <div className={sectionCard}>
        <div className="border-b border-surface-border px-5 py-3">
          <h2 className="text-sm font-semibold text-white">Campaign History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-[#0f1419]/80">
              <tr>
                {["Subject", "Status", "Sent", "Failed", "Total", "Reply-To", "BCC", "Started", "Completed", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-600">Loading…</td></tr>
              ) : campaigns.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-600">No campaigns yet.</td></tr>
              ) : (
                campaigns.map(c => (
                  <tr key={c.id} className="border-b border-surface-border/40 last:border-b-0 hover:bg-white/[0.02]">
                    <td className="max-w-[12rem] truncate px-4 py-3 text-sm font-medium text-white" title={c.subject}>{c.subject}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-400">{c.sent_count}</td>
                    <td className="px-4 py-3 font-mono text-xs text-red-400">{c.failed_count}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{c.total_recipients}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.reply_to ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.bcc ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(c.completed_at)}</td>
                    <td className="px-4 py-3">
                      {c.status !== "running" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCampaign(c.id)}
                          title="Delete campaign record"
                          className="rounded px-2 py-1 text-[11px] text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Default body (Tiptap-compatible HTML) ────────────────────────────────────

const DEFAULT_BODY = `<h2>Greetings from E-Safe!</h2>
<p>Dear Valued Customer,</p>
<p>We hope this message finds you well. Thank you for your continued trust and support.</p>
<p>We would love to hear from you — <a href="https://g.page/r/CTh2ya4JrxQVEAE/review">leave us a review here</a>.</p>
<p><strong>Warm regards,</strong><br>Team E-Safe</p>`;
