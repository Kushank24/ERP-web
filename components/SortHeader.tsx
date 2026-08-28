"use client";
import { SortDir } from "@/lib/useSortedData";

export function SortHeader({
  label,
  colKey,
  currentKey,
  currentDir,
  onSort,
  className = "",
}: {
  label: string;
  colKey: string;
  currentKey: string | null | undefined;
  currentDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = currentKey === colKey;
  return (
    <button
      type="button"
      onClick={() => onSort(colKey)}
      className={`flex items-center gap-0.5 transition-colors hover:text-white ${active ? "text-accent" : "text-slate-600"} ${className}`}
    >
      {label}
      <span className="ml-0.5 text-[9px] leading-none opacity-70">
        {active ? (currentDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}
