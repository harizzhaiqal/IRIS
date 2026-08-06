import { IrisMark, type IrisTone } from "@/components/brand/iris-logo";
import { cn } from "@/lib/utils";

/**
 * The loading indicator: the IRIS mark with its blades lighting in turn.
 *
 * Same geometry as the logo rather than a separate shape, so the thing users
 * wait on is the thing they just clicked. The centre ring is dropped — at
 * spinner sizes it reads as noise rather than detail.
 *
 * The mark is decorative by default. Pass `label` only when there is no
 * visible text beside it; otherwise the caller should own the live region, or
 * screen readers announce the same string twice.
 */
export function IrisSpinner({
  size = 40,
  tone = "light",
  className,
  label,
}: {
  size?: number;
  tone?: IrisTone;
  className?: string;
  label?: string;
}) {
  const mark = (
    <IrisMark
      size={size}
      ring={false}
      tone={tone}
      animate
      className={label ? undefined : className}
    />
  );

  if (!label) return <span aria-hidden>{mark}</span>;

  return (
    <span role="status" aria-live="polite" className={cn("inline-flex", className)}>
      {mark}
      <span className="sr-only">{label}</span>
    </span>
  );
}
