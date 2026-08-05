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
 *    whatever is behind the logo instead of only with the other blades.
 */

const BLADES = [0, 60, 120, 180, 240, 300];

/** Both pairings come from the sheet: it lightens on dark surfaces and darkens
 *  on light ones, so the overlaps stay visible either way. */
const TONES = {
  light: {
    gradient:
      "linear-gradient(135deg, oklch(0.6 0.19 290), oklch(0.65 0.16 195))",
    blend: "multiply" as const,
    ring: "oklch(0.3 0.02 260 / 0.4)",
    word: "oklch(0.3 0.02 260)",
  },
  dark: {
    gradient:
      "linear-gradient(135deg, oklch(0.72 0.19 290), oklch(0.78 0.16 195))",
    blend: "screen" as const,
    ring: "oklch(0.8 0.05 260 / 0.4)",
    word: "oklch(0.97 0.005 260)",
  },
} as const;

const HOLE =
  "radial-gradient(circle at 50% 50%, transparent 0 13%, #000 13.4%)";

const SIZES = {
  /** Login brand panel. Sized to own the panel rather than sit politely in the
   *  corner of it — the lockup comes to ~316px inside 554px of usable width. */
  xl: { mark: 128, text: 96, gap: 30, tracking: "-0.03em", ring: true },
  /** The sheet's own "Website header" spec, used as-is. Also the mobile login
   *  band, where the panel is only ~94px tall. */
  sm: { mark: 32, text: 22, gap: 14, tracking: "-0.02em", ring: false },
} as const;

export type IrisTone = keyof typeof TONES;

export function IrisMark({
  size = 80,
  ring = true,
  tone = "light",
  className,
}: {
  size?: number;
  ring?: boolean;
  tone?: IrisTone;
  className?: string;
}) {
  const t = TONES[tone];

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
              background: t.gradient,
              mixBlendMode: t.blend,
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
            border: `2px solid ${t.ring}`,
            transform: "translate(-50%,-50%)",
          }}
        />
      ) : null}
    </span>
  );
}

export function IrisLogo({
  size = "sm",
  tone = "light",
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: IrisTone;
  className?: string;
}) {
  const { mark, text, gap, tracking, ring } = SIZES[size];

  return (
    <span
      aria-label="IRIS"
      className={cn("inline-flex items-center", className)}
      style={{ gap }}
    >
      <IrisMark size={mark} ring={ring} tone={tone} />
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontSize: text,
          fontWeight: 700,
          letterSpacing: tracking,
          lineHeight: 1,
          color: TONES[tone].word,
        }}
      >
        IRIS
      </span>
    </span>
  );
}
