"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@/lib/auth-context";
import { MODULE_NAV } from "@/lib/nav";

// ─── Permission data ──────────────────────────────────────────────────────────

const ALL_ROLES = ["admin", "manager", "operator", "offer_maker", "viewer"] as const;
type Role = (typeof ALL_ROLES)[number];

/**
 * Role-based default access map for all modules.
 * Actual per-user access is controlled by `allowed_modules` in the DB.
 */
const MODULE_PERMISSIONS: Record<string, Role[]> = {
  dashboard:       ["admin", "manager", "operator", "offer_maker", "viewer"],
  companies:       ["admin", "manager", "operator", "offer_maker"],
  enquiries:       ["admin", "manager", "operator", "offer_maker"],
  offers:          ["admin", "manager", "operator", "offer_maker"],
  product_catalog: ["admin", "manager", "operator", "offer_maker"],
  purchase_orders: ["admin", "manager"],
  sales_orders:    ["admin", "manager"],
  inventory:       ["admin", "manager", "operator"],
  products_boq:    ["admin", "manager", "offer_maker"],
  pricing:         ["admin", "manager"],
  work_orders:     ["admin", "manager", "operator"],
  finished_goods:  ["admin", "manager", "operator"],
  settings:        ["admin"],
};

const MODULE_ICONS: Record<string, string> = {
  dashboard: "📊",
  purchase_orders: "🛒",
  sales_orders: "📦",
  inventory: "🏗️",
  product_catalog: "📋",
  products_boq: "🔩",
  pricing: "💰",
  work_orders: "⚙️",
  finished_goods: "✅",
  settings: "⚙️",
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  offer_maker: "Offer Maker",
  viewer: "Viewer",
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "border-red-700/40 bg-red-950/40 text-red-300",
  manager: "border-blue-700/40 bg-blue-950/40 text-blue-300",
  operator: "border-amber-700/40 bg-amber-950/40 text-amber-300",
  offer_maker: "border-violet-700/40 bg-violet-950/40 text-violet-300",
  viewer: "border-slate-600/40 bg-slate-800/40 text-slate-300",
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "account" | "permissions" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "permissions", label: "Permissions" },
  { id: "about", label: "About" },
];

// ─── Account Tab ──────────────────────────────────────────────────────────────

function AccountTab({ user }: { user: User }) {
  const roleBadge =
    ROLE_BADGE[user.role as Role] ??
    "border-slate-600/40 bg-slate-800/40 text-slate-300";

  return (
    <div className="space-y-5">
      {/* ── User info card ── */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-2xl font-bold text-accent">
            {user.username[0].toUpperCase()}
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            {/* Username */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Username
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {user.username}
              </p>
            </div>

            {/* Role */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Role
              </p>
              <span
                className={`mt-1.5 inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold capitalize ${roleBadge}`}
              >
                {user.role}
              </span>
            </div>

            {/* Allowed modules */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Allowed Modules ({user.allowed_modules.length})
              </p>
              {user.allowed_modules.length === 0 ? (
                <p className="text-xs italic text-slate-600">
                  No modules assigned.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.allowed_modules.map((key) => {
                    const nav = MODULE_NAV[key];
                    const icon = MODULE_ICONS[key] ?? "•";
                    return (
                      <span
                        key={key}
                        className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-[#0f1419] px-3 py-1.5 text-xs text-slate-300"
                      >
                        <span>{icon}</span>
                        <span>{nav?.label ?? key}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Session indicator ── */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-800/30 bg-emerald-950/20 px-5 py-4">
        {/* Pulsing dot */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
        </span>
        <div>
          <p className="text-sm font-medium text-emerald-300">Session active</p>
          <p className="mt-0.5 text-xs text-emerald-400/60">
            Authenticated via Supabase Auth · JWT token valid
          </p>
        </div>
      </div>

      {/* ── Quick facts ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Auth Provider
          </p>
          <p className="mt-1.5 text-sm font-medium text-white">Supabase Auth</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Access Level
          </p>
          <p className="mt-1.5 text-sm font-medium capitalize text-white">
            {user.role}
          </p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Modules Assigned
          </p>
          <p className="mt-1.5 text-sm font-medium text-white">
            {user.allowed_modules.length} / {Object.keys(MODULE_NAV).length}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab({ userRole }: { userRole: string }) {
  const isAdmin = userRole === "admin";
  const modules = Object.keys(MODULE_NAV);

  return (
    <div className="space-y-4">
      {/* Non-admin notice */}
      {!isAdmin && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-800/30 bg-amber-950/20 px-4 py-3 text-sm">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"><path d="M8 2L2 13h12L8 2z"/><path d="M8 7v3M8 11.5v.5"/></svg>
          <p className="text-amber-300">
            You are viewing read-only permission defaults. Only{" "}
            <span className="font-semibold text-amber-200">admin</span> users
            can modify role assignments and module access.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-emerald-400"><path d="M3 8l3 3 7-6"/></svg>
          Role has access by default
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-600 text-base leading-none">—</span>
          Role does not have access
        </span>
      </div>

      {/* Permission grid */}
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-left">
          <thead className="border-b border-surface-border bg-surface-card">
            <tr>
              {/* Module column header */}
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Module
              </th>
              {/* Role column headers */}
              {ALL_ROLES.map((role) => (
                <th
                  key={role}
                  className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  <span
                    className={`inline-flex items-center rounded border px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[role]}`}
                  >
                    {ROLE_LABEL[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((key, idx) => {
              const nav = MODULE_NAV[key];
              const icon = MODULE_ICONS[key] ?? "•";
              const allowedRoles = MODULE_PERMISSIONS[key] ?? [];
              const isCurrentUserModule =
                userRole === "admin" || allowedRoles.includes(userRole as Role);

              return (
                <tr
                  key={key}
                  className={`border-b border-surface-border/40 last:border-0 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-white/[0.01]"
                  } ${isCurrentUserModule ? "" : "opacity-60"}`}
                >
                  {/* Module name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base leading-none">{icon}</span>
                      <span className="text-sm text-slate-200">
                        {nav?.label ?? key}
                      </span>
                      {key === "settings" && (
                        <span className="rounded bg-red-950/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                          Admin only
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Role cells */}
                  {ALL_ROLES.map((role) => {
                    const hasAccess = allowedRoles.includes(role);
                    return (
                      <td
                        key={role}
                        className="px-4 py-3.5 text-center"
                        title={
                          hasAccess
                            ? `${ROLE_LABEL[role]} can access ${nav?.label ?? key}`
                            : `${ROLE_LABEL[role]} cannot access ${nav?.label ?? key}`
                        }
                      >
                        {hasAccess ? (
                          <span className="inline-flex items-center justify-center text-emerald-400">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 8l3 3 7-6"/></svg>
                          </span>
                        ) : (
                          <span className="text-xl leading-none text-slate-700">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="text-[11px] leading-relaxed text-slate-600">
        * The table above shows role-based default access. Actual per-user
        access is controlled by the{" "}
        <code className="rounded bg-[#0f1419] px-1.5 py-0.5 font-mono text-slate-400">
          allowed_modules
        </code>{" "}
        field on the User record in the database. An admin can expand or
        restrict a user&rsquo;s access beyond the defaults shown here.
      </p>
    </div>
  );
}

// ─── About Tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  const techStack = [
    { abbr: "N", name: "Next.js 14", desc: "React framework with App Router, server & client components", color: "bg-white/10 text-white" },
    { abbr: "F", name: "FastAPI", desc: "High-performance Python async REST API backend", color: "bg-emerald-500/10 text-emerald-400" },
    { abbr: "PG", name: "PostgreSQL", desc: "Relational database hosted on Supabase", color: "bg-blue-500/10 text-blue-400" },
    { abbr: "SB", name: "Supabase Auth", desc: "Authentication, JWT tokens & row-level security", color: "bg-emerald-500/10 text-emerald-400" },
    { abbr: "TW", name: "Tailwind CSS", desc: "Utility-first CSS framework for rapid UI development", color: "bg-cyan-500/10 text-cyan-400" },
    { abbr: "SA", name: "SQLAlchemy", desc: "Python ORM for database models and migrations (Alembic)", color: "bg-slate-500/10 text-slate-400" },
  ];

  const features = [
    { title: "Purchase Orders", desc: "Create, track and manage vendor purchase orders end-to-end" },
    { title: "Sales Orders", desc: "Manage customer orders, pricing and fulfilment pipeline" },
    { title: "Inventory", desc: "Track raw material stock levels, units and per-unit costs" },
    { title: "Products & BOQ", desc: "Define products with full bill of quantities per material line" },
    { title: "Product Pricing", desc: "Set and update default unit prices with BOQ-informed estimates" },
    { title: "Work Orders", desc: "Schedule production runs and monitor order completion status" },
    { title: "Finished Goods", desc: "Track completed product stock by party, batch and quantity" },
    { title: "Dashboard", desc: "Real-time KPI summary across all operations and alerts" },
    { title: "System Settings", desc: "Account management, module permissions and system information" },
  ];

  return (
    <div className="space-y-7">
      {/* ── App identity card ── */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M12 2l7 4v6c0 4.4-3.1 8.5-7 9.5C8.1 20.5 5 16.4 5 12V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">E-Safe ERP</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Enterprise Resource Planning · Safety Equipment Operations
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent">
                v1.0.0
              </span>
              <span className="rounded border border-emerald-800/30 bg-emerald-950/20 px-2.5 py-0.5 text-[11px] text-emerald-400">
                Stable
              </span>
              <span className="rounded border border-surface-border bg-[#0f1419] px-2.5 py-0.5 text-[11px] text-slate-400">
                Next.js App Router
              </span>
            </div>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-slate-400">
          E-Safe ERP is a full-stack enterprise resource planning system built
          for safety equipment manufacturers. It provides end-to-end operational
          visibility — from raw material procurement and inventory tracking
          through production work orders to finished-goods dispatch. The system
          replaces the original Streamlit prototype with a production-grade
          Next.js 14 + FastAPI architecture backed by PostgreSQL on Supabase.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Architecture", value: "Full-Stack SaaS" },
            { label: "Deployment", value: "Supabase + Vercel" },
            { label: "Origin", value: "Streamlit Migration" },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-surface-border bg-[#0f1419] px-4 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-sm font-medium text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tech stack ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Tech Stack</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {techStack.map((t) => (
            <div
              key={t.name}
              className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5"
            >
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${t.color}`}>
                {t.abbr}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {t.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">
          Module Features
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <div>
                <p className="text-sm font-medium text-slate-200">{f.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="rounded-lg border border-surface-border bg-surface-card/40 px-5 py-4">
        <p className="text-xs leading-relaxed text-slate-500">
          Built for{" "}
          <span className="font-medium text-slate-400">E-Safe Industries</span>{" "}
          · Migrated from the Streamlit prototype to a production Next.js +
          FastAPI stack. For support or system configuration contact your
          administrator. Data is persisted in Supabase PostgreSQL and access is
          controlled via Supabase Auth JWT tokens.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("account");

  const isAdmin = user?.role === "admin";

  // ── Loading state ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            System Settings
          </h1>
          <p className="mt-1 text-sm text-slate-400">Loading user session…</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-lg bg-surface-card" />
          <div className="h-48 rounded-xl bg-surface-card" />
        </div>
      </div>
    );
  }

  // ── Not authenticated ─────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-white">
          System Settings
        </h1>
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-300">
            No active session found. Please sign in to view settings.
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            System Settings
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Account information, module permissions and system details.
          </p>
        </div>

        {/* Non-admin notice badge */}
        {!isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-800/30 bg-amber-950/20 px-3.5 py-2 text-xs text-amber-300">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M8 2L2 13h12L8 2z"/><path d="M8 7v3M8 11.5v.5"/></svg>
            <span>
              Some settings are restricted to{" "}
              <span className="font-semibold text-amber-200">admin</span> role
            </span>
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="border-b border-surface-border">
        <div className="flex gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px rounded-t-lg border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="min-h-[400px]">
        {activeTab === "account" && <AccountTab user={user} />}
        {activeTab === "permissions" && <PermissionsTab userRole={user.role} />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}
