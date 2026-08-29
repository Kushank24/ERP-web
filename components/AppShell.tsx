"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { MODULE_NAV } from "@/lib/nav";

// ── SVG icon set (20×20 viewBox, stroke-based) ────────────────────────────

function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const shapes: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </>
    ),
    purchase_orders: (
      <>
        <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M12 2v5h5" />
        <path d="M10 9v5M8 12.5l2 2 2-2" />
      </>
    ),
    sales_orders: (
      <>
        <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M12 2v5h5" />
        <path d="M10 14V9M8 11.5l2-2 2 2" />
      </>
    ),
    inventory: (
      <>
        <path d="M10 3L3 7.5V14L10 18L17 14V7.5L10 3z" />
        <path d="M3 7.5L10 12L17 7.5" />
        <path d="M10 12V18" />
      </>
    ),
    products_boq: (
      <>
        <rect x="4" y="4" width="12" height="14" rx="1" />
        <path d="M8 2h4a1 1 0 011 1v2a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M7 10h6M7 13h4" />
      </>
    ),
    pricing: (
      <>
        <path d="M4 4h6l6.5 6.5-6 6L4 10V4z" />
        <circle cx="8.5" cy="8.5" r="1.5" />
      </>
    ),
    work_orders: (
      <>
        <rect x="3" y="2" width="14" height="17" rx="1.5" />
        <path d="M7 7h6M7 11h6M7 15h4" />
      </>
    ),
    finished_goods: (
      <>
        <circle cx="10" cy="10" r="8" />
        <path d="M7 10l2 2.5 4-4.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.55 4.55l1.77 1.77M13.68 13.68l1.77 1.77M4.55 15.45l1.77-1.77M13.68 6.32l1.77-1.77" />
      </>
    ),
    companies: (
      <>
        <path d="M3 17V7a1 1 0 011-1h4V4a1 1 0 011-1h4a1 1 0 011 1v2h4a1 1 0 011 1v10" />
        <path d="M1 17h18" />
        <path d="M8 17v-4h4v4" />
      </>
    ),
    enquiries: (
      <>
        <circle cx="10" cy="10" r="8" />
        <path d="M10 6v4l3 3" />
      </>
    ),
    offers: (
      <>
        <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H7l-4 3V5a1 1 0 011-1z" />
        <path d="M8 9h4M8 12h2" />
      </>
    ),
    logout: (
      <>
        <path d="M8 3H5a1 1 0 00-1 1v12a1 1 0 001 1h3" />
        <path d="M13 7l4 3-4 3" />
        <path d="M8 10h9" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shapes[name] ?? <circle cx="10" cy="10" r="3" />}
    </svg>
  );
}

// ── Navigation groups ─────────────────────────────────────────────────────

const NAV_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Overview", keys: ["dashboard"] },
  { label: "CRM", keys: ["companies", "enquiries", "offers", "product_catalog"] },
  { label: "Procurement", keys: ["purchase_orders"] },
  { label: "Production", keys: ["work_orders", "products_boq", "inventory", "finished_goods"] },
  { label: "Sales", keys: ["sales_orders", "pricing"] },
  { label: "Marketing", keys: ["email_campaigns"] },
  { label: "System", keys: ["settings"] },
];

// ── Per-page header descriptions ──────────────────────────────────────────

const PAGE_META: Record<string, string> = {
  dashboard: "Overview and key metrics",
  purchase_orders: "Manage supplier purchase orders",
  sales_orders: "Track customer orders and dispatch",
  inventory: "Raw material stock levels",
  products_boq: "Products and bill of quantities",
  pricing: "Product pricing configuration",
  work_orders: "Production work orders",
  finished_goods: "Completed product inventory",
  settings: "User access and system configuration",
};

// ── Shell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const allowed = user?.allowed_modules ?? [];

  const currentKey =
    allowed.find((key) => {
      const item = MODULE_NAV[key];
      return (
        item &&
        (pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href)))
      );
    }) ?? "";
  const currentItem = MODULE_NAV[currentKey];

  return (
    <div className="flex min-h-screen bg-[#0b0f14]">
      {/* ── Sidebar ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-surface-border bg-surface-card">
        {/* Brand */}
        <div className="border-b border-surface-border px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
            E-Safe
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">ERP Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {NAV_GROUPS.map((group) => {
            const visible = group.keys.filter((k) => allowed.includes(k));
            if (visible.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.label}
                </p>
                <ul className="space-y-px">
                  {visible.map((key) => {
                    const item = MODULE_NAV[key];
                    if (!item) return null;
                    const active =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href));
                    return (
                      <li key={key}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                            active
                              ? "bg-accent/15 font-medium text-accent"
                              : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          <NavIcon
                            name={key}
                            className={`h-[15px] w-[15px] shrink-0 ${
                              active ? "text-accent" : "text-slate-500"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                          {active && (
                            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-surface-border px-3 py-3">
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
              {(user?.username?.[0] ?? "U").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-white">
                {user?.username ?? "—"}
              </p>
              <p className="truncate text-[10px] capitalize text-slate-500">
                {user?.role ?? "—"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/auth/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-2.5 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-slate-500 hover:bg-white/[0.04] hover:text-white"
          >
            <NavIcon name="logout" className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-surface-border bg-[#0b0f14]/80 px-8 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-white">
                {currentItem?.label ?? "E-Safe ERP"}
              </h1>
              {currentKey && PAGE_META[currentKey] && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {PAGE_META[currentKey]}
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          </div>
        </header>

        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
