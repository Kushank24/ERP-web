"use client";

import { useEffect, useRef, useState } from "react";

interface SimpleMaterial {
  id: number;
  name: string;
}

interface Props {
  value: string;
  onChange(name: string): void;
  materials: SimpleMaterial[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function MaterialCombobox({
  value,
  onChange,
  materials,
  placeholder,
  className,
  required,
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep local query in sync when value is set externally (e.g. editing an existing line)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered =
    query.trim() === ""
      ? materials.slice(0, 60)
      : materials
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 60);

  function select(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        required={required}
        value={query}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 z-50 mt-0.5 max-h-52 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-surface-border bg-[#0f1419] text-xs shadow-xl">
          {filtered.map((m) => (
            <li
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click registers
                select(m.name);
              }}
              className="cursor-pointer px-3 py-1.5 text-slate-300 hover:bg-accent/20 hover:text-white"
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
