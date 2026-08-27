"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface Product { id: number; name: string; default_unit_price: number; }

export function ProductCombobox({ value, onSelect, hasSpecs = false }: {
  value: { id: number; name: string } | null;
  onSelect: (p: Product | null) => void;
  hasSpecs?: boolean;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value?.name ?? ""); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function search(q: string) {
    setQuery(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page_size: "20" });
      if (q.trim()) params.set("search", q.trim());
      if (hasSpecs) params.set("has_specs", "true");
      api<{ items: Product[] }>(`/api/v1/products?${params}`)
        .then(res => { setResults(res.items); setLoading(false); })
        .catch(() => setLoading(false));
    }, 200);
  }

  function select(p: Product) {
    onSelect(p);
    setQuery(p.name);
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="flex items-center gap-1">
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => { if (!value) search(query); else setOpen(false); }}
          placeholder="Search product…"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none hover:border-surface-border focus:border-accent/60 focus:bg-[#0b0f14]"
        />
        {value && (
          <button type="button" onClick={clear} title="Clear product"
            className="shrink-0 px-1 text-slate-500 hover:text-red-400">✕</button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-52 overflow-y-auto rounded-lg border border-surface-border bg-[#0f1419] shadow-xl">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No products found.</p>
          ) : results.map(p => (
            <button key={p.id} type="button" onMouseDown={() => select(p)}
              className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-accent/20 hover:text-white">
              <span className="font-medium">{p.name}</span>
              {p.default_unit_price > 0 && (
                <span className="ml-2 text-slate-500">₹{p.default_unit_price.toFixed(2)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
