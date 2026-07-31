/**
 * Money helpers.
 *
 * Costs are stored as integer cents for the same reason durations are stored as
 * integer minutes: a float total eventually reports a figure nobody can
 * reconcile. Formatting to currency happens only at the display layer.
 */

const CURRENCY = "RM";

export function formatCost(cents: number): string {
  return `${CURRENCY} ${(cents / 100).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Parses what someone typed into a cost field. Accepts "890", "890.50",
 * "1,200.00" and a leading RM. Returns null when the text is not a cost, so the
 * caller can tell "nothing entered" from "zero".
 */
export function parseCostToCents(value: string): number | null {
  const cleaned = value.trim().replace(/^rm\s*/i, "").replace(/,/g, "");
  if (cleaned === "") return null;

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  // Built from the digits rather than by multiplying a float, so 8.90 cannot
  // arrive as 889 cents.
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** The inverse, for pre-filling the form when editing. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
