import { cn } from "@/lib/utils";

/**
 * A few honeycomb cells blown far past any usable lattice and cropped by the
 * viewport — the iRS hexagon used as scenery rather than pattern.
 *
 * The cells are pointy-top to match the company mark, and deliberately large
 * enough that they read as shapes rather than texture.
 */

const VIEW_W = 1440;
const VIEW_H = 900;

/** On the brand panel the cells become white; the per-cell opacities below are
 *  tuned for a light surface, so the dark tone scales them down. */
const TONES = {
  light: {
    stroke: "hsl(185 40% 62%)",
    fill: "hsl(185 55% 45%)",
    scale: 1,
  },
  dark: {
    stroke: "#FFFFFF",
    fill: "#FFFFFF",
    scale: 0.42,
  },
} as const;

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
 * clear. Neighbours sit on true lattice offsets — 1.5r down and 0.866r across —
 * so the cells meet flush the way a honeycomb does rather than merely
 * overlapping.
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

export function Honeycomb({
  tone = "light",
  className,
}: {
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];

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
            opacity={cell.opacity * t.scale}
            {...(cell.fill
              ? { fill: t.fill }
              : {
                  stroke: t.stroke,
                  strokeWidth: 3,
                  strokeLinejoin: "round" as const,
                })}
          />
        ))}
      </svg>
    </div>
  );
}
