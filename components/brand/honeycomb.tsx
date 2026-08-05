import { cn } from "@/lib/utils";

/**
 * The honeycomb accent on the login brand panel — a cluster of cells tucked
 * into the top-right corner, dissolving toward the headline.
 *
 * An earlier revision tiled the whole panel. That made the pattern the
 * background rather than a detail on it, and left no room for the treatments
 * to differ from one another. Keeping it to one corner lets the rest of the
 * panel carry the logo and copy.
 *
 * The patch is drawn in its own coordinate space and positioned with CSS
 * rather than scaled to fill the panel: a `slice`-scaled viewBox crops
 * unpredictably as the panel's aspect ratio changes, which would drift the
 * accent off-screen at some window sizes.
 */

const COLS = 5;
const ROWS = 5;

const R = 40;
const COL_STEP = R * Math.sqrt(3);
const ROW_STEP = R * 1.5;

const WIDTH = COLS * COL_STEP + R * 0.866;
const HEIGHT = (ROWS - 1) * ROW_STEP + R * 2;

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

/** Roughly one cell in four is solid, so the patch has some weight instead of
 *  reading as wireframe only. */
const CELLS = Array.from({ length: ROWS }, (_, row) =>
  Array.from({ length: COLS }, (_, col) => ({
    key: `${col}:${row}`,
    cx: R * 0.866 + col * COL_STEP + (row % 2 ? COL_STEP / 2 : 0),
    cy: R + row * ROW_STEP,
    solid: noise(col, row) < 0.26,
  })),
).flat();

export function Honeycomb({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -right-14 -top-14 h-[15rem] w-[18rem] lg:h-[21rem] lg:w-[25rem]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${WIDTH.toFixed(0)} ${HEIGHT.toFixed(0)}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        <defs>
          {/* Solid at the top-right corner, gone by the bottom-left, so the
              cluster fades into the panel rather than ending on a hard edge. */}
          <linearGradient id="honeycomb-fade" x1="1" y1="0" x2="0.15" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#8A8A8A" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <mask id="honeycomb-mask">
            <rect
              width={WIDTH}
              height={HEIGHT}
              fill="url(#honeycomb-fade)"
            />
          </mask>
        </defs>

        <g mask="url(#honeycomb-mask)">
          {CELLS.map((c) =>
            c.solid ? (
              <path
                key={c.key}
                d={hexPath(c.cx, c.cy, R)}
                fill="#FFFFFF"
                opacity={0.12}
              />
            ) : (
              <path
                key={c.key}
                d={hexPath(c.cx, c.cy, R)}
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinejoin="round"
                opacity={0.375}
              />
            ),
          )}
        </g>
      </svg>
    </div>
  );
}
