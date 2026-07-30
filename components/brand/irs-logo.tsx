import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The company logo, served from the original artwork at public/irs-logo.png.
 *
 * The source is 432x200 with a transparent background, so it sits on tinted
 * surfaces without a white box behind it. Height is set by the caller and the
 * width follows; keep displayed heights at or under 100px so the raster still
 * has headroom on a 2x screen.
 */
export function IrsLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/irs-logo.png"
      alt="iRS"
      width={432}
      height={200}
      priority={priority}
      className={cn("h-16 w-auto", className)}
    />
  );
}
