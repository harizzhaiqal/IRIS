import { cn } from "@/lib/utils";

/**
 * The IRIS mark, from the Claude Design logo sheet.
 *
 * Six circular blades at 60° intervals, each offset radially, with the centre
 * punched out — an iris/aperture. Geometry is taken verbatim from the sheet:
 * blade diameter 56% of the box, pushed out by 38% of its own width, centre
 * hole 26%.
 *
 * Two details are deliberate departures from the sheet's markup:
 *
 * 1. The hole is a real mask rather than a disc filled with the page colour.
 *    The sheet could hardcode its backdrop; this app puts the mark on white,
 *    on the tinted login panel, and over the honeycomb, so a filled disc would
 *    show as a visible blob on two of the three.
 * 2. The blade group is isolated. `mix-blend-mode` otherwise blends with
 *    whatever is behind the logo — including the honeycomb — instead of only
 *    with the other blades. Isolated, a transparent backdrop leaves the first
 *    blade untouched and the overlaps still darken, which is the whole effect.
 */

const BLADES = [0, 60, 120, 180, 240, 300];

/** The sheet's "on light" pairing. The app has no dark surfaces behind the
 *  logo, so the screen-blended dark variant is not carried over. */
const BLADE_GRADIENT =
  "linear-gradient(135deg, oklch(0.6 0.19 290), oklch(0.65 0.16 195))";

const HOLE =
  "radial-gradient(circle at 50% 50%, transparent 0 13%, #000 13.4%)";

const SIZES = {
  /** Login screen. The sheet's primary lockup, scaled to a 384px column. */
  lg: { mark: 80, text: 60, gap: 24, tracking: "-0.03em", ring: true },
  /** The sheet's own "Website header" spec, used as-is. */
  sm: { mark: 32, text: 22, gap: 14, tracking: "-0.02em", ring: false },
} as const;

export function IrisMark({
  size = 80,
  ring = true,
  className,
}: {
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 isolate"
        style={{ WebkitMaskImage: HOLE, maskImage: HOLE }}
      >
        {BLADES.map((angle) => (
          <span
            key={angle}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "56%",
              height: "56%",
              borderRadius: "50%",
              background: BLADE_GRADIENT,
              mixBlendMode: "multiply",
              transform: `translate(-50%,-50%) rotate(${angle}deg) translateX(38%)`,
            }}
          />
        ))}
      </span>

      {/* The sheet rings the hole at large sizes and drops the ring — then the
          hole itself — as the mark shrinks. */}
      {ring ? (
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "26%",
            height: "26%",
            borderRadius: "50%",
            border: "2px solid oklch(0.3 0.02 260 / 0.4)",
            transform: "translate(-50%,-50%)",
          }}
        />
      ) : null}
    </span>
  );
}

export function IrisLogo({
  size = "lg",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { mark, text, gap, tracking, ring } = SIZES[size];

  return (
    <span
      aria-label="IRIS"
      className={cn("inline-flex items-center", className)}
      style={{ gap }}
    >
      <IrisMark size={mark} ring={ring} />
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontSize: text,
          fontWeight: 700,
          letterSpacing: tracking,
          lineHeight: 1,
          color: "oklch(0.3 0.02 260)",
        }}
      >
        IRIS
      </span>
    </span>
  );
}
