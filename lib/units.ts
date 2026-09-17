/**
 * Single source of truth for stock unit labels.
 *
 * These labels are written straight into `materials.unit`,
 * `bill_of_quantities.units` and `purchase_order_lines.unit`, and the backend
 * converts between them when a work order explodes a BOQ against inventory
 * (`backend/app/unit_conversion.py`).
 *
 * Adding a label here is only half the job: the backend conversion table must
 * recognise its spelling too, or `convert_qty` returns None and the caller
 * falls back to the raw quantity — deducting the wrong amount with no error.
 * `CANONICAL_UNITS` in unit_conversion.py is the matching list.
 *
 * These lists used to be declared per page and had drifted:
 *   products/page.tsx        ["Nos", "Kg", "Meter", "Set"]
 *   purchase-orders/page.tsx ["Nos", "Kg", "Meter", "Feet", "Sq. Meter", "Set"]
 * so a BOQ could not be expressed in the same unit as the material it consumed.
 */

/** Units selectable for materials, BOQ lines and purchase-order lines. */
export const STOCK_UNITS = [
  "Nos",
  "Set",
  "Kg",
  "g",
  "Meter",
  "Feet",
  "mm",
  "SqMtr",
  "Sq. Feet",
] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];

/**
 * Quotation display units for offer line items. A separate vocabulary on
 * purpose — these are what the customer sees on the PDF, not stock units, and
 * they are never converted against inventory.
 */
export const OFFER_UNITS = ["PC", "SET", "MTR"] as const;

export type OfferUnit = (typeof OFFER_UNITS)[number];

/** What each unit measures. Units in different dimensions cannot convert. */
export const UNIT_DIMENSION: Record<string, "count" | "mass" | "length" | "area"> = {
  Nos: "count",
  Set: "count",
  Kg: "mass",
  g: "mass",
  Meter: "length",
  Feet: "length",
  mm: "length",
  SqMtr: "area",
  "Sq. Feet": "area",
};

/**
 * True when a BOQ line in `from` can be consumed from stock held in `to`.
 * Mirrors the backend rule: same dimension, or identical unit.
 */
export function unitsCompatible(from: string, to: string): boolean {
  if (from === to) return true;
  const a = UNIT_DIMENSION[from];
  const b = UNIT_DIMENSION[to];
  if (!a || !b) return false;
  if (a === "count" || b === "count") return false; // counts only match exactly
  return a === b;
}
