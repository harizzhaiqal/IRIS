import Link from "next/link";

import { IrisLogo } from "@/components/brand/iris-logo";

/**
 * The sidebar's masthead.
 *
 * Height comes from padding rather than a fixed `h-16`. At 64px the 32px mark
 * plus its caption left only ~6px of air top and bottom, which read as the
 * logo being wedged between the window edge and the nav.
 */
export function SidebarHeader() {
  return (
    <div className="flex flex-col gap-2 border-b px-5 py-6">
      <Link
        href="/dashboard"
        aria-label="IRIS — go to dashboard"
        className="inline-flex w-fit"
      >
        <IrisLogo size="sm" />
      </Link>
      <p className="text-xs text-muted-foreground">
        IRS Records &amp; Insight System
      </p>
    </div>
  );
}
