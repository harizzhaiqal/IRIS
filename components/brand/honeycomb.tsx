import { cn } from "@/lib/utils";

/**
 * Honeycomb scenery for the login brand panel, echoing the iRS hexagon.
 *
 * Three treatments, all built from one lattice so they stay in the same visual
 * family:
 *
 * - `lattice`  an even tiled field, fading across the diagonal
 * - `layered`  that field plus oversized cropped cells for depth
 * - `scatter`  that field with a fifth of the cells filled, unevenly
 *
 * Cells are generated rather than stamped with <pattern> because two of the
 * three need individual cells to differ, and a pattern can only repeat one
 * stamp.
 */

export type HoneycombVariant = "lattice" | "layered" | "scatter";

const VIEW_W = 1440;
const VIEW_H = 900;

/** Pointy-top, matching the orientation of the company mark. */
const R = 52;
const COL_STEP = R * Math.sqrt(3);
const ROW_STEP = R * 1.5;

/** Opacities below are authored for a light surface; `alpha` pulls them back
 *  for white-on-turquoise, which reads much hotter at the same value. */
const TONES = {
  light: { stroke: "hsl(185 40% 62%)", fill: "hsl(185 55% 45%)", alpha: 1 },
  dark: { stroke: "#FFFFFF", fill: "#FFFFFF", alpha: 0.6 },
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

/** Deterministic per-cell value. Not Math.random: this renders on the server,
 *  and a random fill would differ from any client re-render. */
function noise(col: number, row: number) {
  const v = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

type Cell = { key: string; d: string; col: number; row: number };

const CELLS: Cell[] = (() => {
  const out: Cell[] = [];
  const cols = Math.ceil(VIEW_W / COL_STEP) + 2;
  const rows = Math.ceil(VIEW_H / ROW_STEP) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const cx = col * COL_STEP + (row % 2 === 0 ? 0 : COL_STEP / 2);
      const cy = row * ROW_STEP;
      out.push({ key: `${col}:${row}`, d: hexPath(cx, cy, R), col, row });
    }
  }
  return out;
})();

/** Oversized cells for `layered`. Neighbours sit on true lattice offsets —
 *  1.5r down, 0.866r across — so they meet flush rather than just overlapping. */
const BIG = [
  { cx: 40, cy: 60, r: 210, fill: false, opacity: 0.55 },
  { cx: 40, cy: 60 + 210 * 1.5, r: 210, fill: true, opacity: 0.16 },
  { cx: 40 + 210 * 0.866, cy: 60 + 210 * 0.75, r: 105, fill: true, opacity: 0.24 },
  { cx: VIEW_W - 20, cy: VIEW_H - 40, r: 260, fill: false, opacity: 0.5 },
  {
    cx: VIEW_W - 20 - 260 * 0.866,
    cy: VIEW_H - 40 - 260 * 0.75,
    r: 130,
    fill: true,
    opacity: 0.18,
  },
];

export function Honeycomb({
  variant = "layered",
  tone = "light",
  className,
}: {
  variant?: HoneycombVariant;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];
  const id = `hc-${variant}-${tone}`;
  const a = (o: number) => o * t.alpha;

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
        <defs>
          {/* Strongest at the top-right, softest at the bottom-left, where the
              headline and footer sit. Never fades to nothing — a lattice that
              vanishes looks like a rendering bug. */}
          <linearGradient id={`${id}-fade`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#9A9A9A" />
            <stop offset="100%" stopColor="#4D4D4D" />
          </linearGradient>
          <mask id={`${id}-mask`}>
            <rect width={VIEW_W} height={VIEW_H} fill={`url(#${id}-fade)`} />
          </mask>
        </defs>

        <g mask={`url(#${id}-mask)`}>
          <g opacity={a(0.5)}>
            {CELLS.map((c) => (
              <path
                key={c.key}
                d={c.d}
                stroke={t.stroke}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ))}
          </g>

          {variant === "scatter"
            ? CELLS.map((c) => {
                const n = noise(c.col, c.row);
                if (n > 0.2) return null;
                return (
                  <path
                    key={`f-${c.key}`}
                    d={c.d}
                    fill={t.fill}
                    opacity={a(0.07 + (n / 0.2) * 0.16)}
                  />
                );
              })
            : null}
        </g>

        {variant === "layered"
          ? BIG.map((h, i) => (
              <path
                key={`b-${i}`}
                d={hexPath(h.cx, h.cy, h.r)}
                opacity={a(h.opacity)}
                {...(h.fill
                  ? { fill: t.fill }
                  : {
                      stroke: t.stroke,
                      strokeWidth: 3,
                      strokeLinejoin: "round" as const,
                    })}
              />
            ))
          : null}
      </svg>
    </div>
  );
}
