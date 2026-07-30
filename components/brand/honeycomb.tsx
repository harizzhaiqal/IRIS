import { cn } from "@/lib/utils";

/**
 * The login backdrop: a few honeycomb cells blown far past any usable lattice
 * and cropped by the viewport.
 *
 * The cells are pointy-top to match the company mark, and deliberately large
 * enough that they read as shapes rather than as pattern — at lattice scale the
 * texture competes with the form for attention.
 */

const VIEW_W = 1440;
const VIEW_H = 900;

const STROKE = "hsl(185 40% 62%)";
const FILL = "hsl(185 55% 45%)";

function hexPath(cx: number, cy: number, r: number) {
  const w = r * 0.866;
  const h = r / 2;
  return [
    `M${cx.toFixed(1)},${(cy - r).toFixed(1)}`,
    `L${(cx + w).toFixed(1)},${(cy - h).toFixed(1)}`,
    `L${(cx + w).toFixed(1)},${(cy + h).toFixed(1)}`,
    `L${cx.toFixed(1)},${(cy + r).toFixed(1)}`,
    `L${(cx - w).toFixed(1)},${(cy + h).toFixed(1)}`,
    `L${(cx - w).toFixed(1)},${(cy - h).toFixed(1)}Z`,
  ].join(" ");
}

/**
 * Two clusters, top-left and bottom-right, so the diagonal between them stays
 * clear for the card. Neighbours are placed on true lattice offsets — 1.5r down
 * and 0.866r across — so the cells sit flush the way a honeycomb does rather
 * than merely overlapping.
 */
const CELLS = [
  { cx: 40, cy: 60, r: 210, fill: false, opacity: 0.5 },
  { cx: 40, cy: 60 + 210 * 1.5, r: 210, fill: true, opacity: 0.13 },
  { cx: 40 + 210 * 0.866, cy: 60 + 210 * 0.75, r: 105, fill: true, opacity: 0.2 },
  { cx: VIEW_W - 20, cy: VIEW_H - 40, r: 260, fill: false, opacity: 0.45 },
  {
    cx: VIEW_W - 20 - 260 * 0.866,
    cy: VIEW_H - 40 - 260 * 0.75,
    r: 130,
    fill: true,
    opacity: 0.15,
  },
];

export function Honeycomb({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {CELLS.map((cell, i) => (
          <path
            key={i}
            d={hexPath(cell.cx, cell.cy, cell.r)}
            opacity={cell.opacity}
            {...(cell.fill
              ? { fill: FILL }
              : {
                  stroke: STROKE,
                  strokeWidth: 3,
                  strokeLinejoin: "round" as const,
                })}
          />
        ))}
      </svg>
    </div>
  );
}
