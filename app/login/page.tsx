import Image from "next/image";

import { Honeycomb } from "@/components/brand/honeycomb";
import { IrisLogo } from "@/components/brand/iris-logo";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — IRIS" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel. On small screens it collapses to a band so the form
          stays above the fold rather than being pushed off by scenery. */}
      <div className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-primary px-6 py-7 text-primary-foreground lg:w-[52%] lg:px-14 lg:py-14">
        <Honeycomb tone="dark" />

        <div className="relative">
          <IrisLogo size="md" tone="dark" />
        </div>

        <div className="relative mt-8 hidden lg:mt-0 lg:block">
          <p className="max-w-xl text-[2.1rem] font-medium leading-snug tracking-tight">
            Training records and monthly reporting, in one place.
          </p>
          <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-primary-foreground/65">
            IRS Records and Insight System — the internal workspace for training
            submissions, review and approval at IRS Software Solution.
          </p>
        </div>

        <p className="relative hidden text-xs text-primary-foreground/50 lg:block">
          © {new Date().getFullYear()} IRS Software Solution
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12 lg:px-14">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Log in to IRIS
            </h1>
            <p className="text-sm text-muted-foreground">
              Use the work email your administrator registered.
            </p>
          </div>

          <LoginForm redirectTo={searchParams.redirectTo} bare />

          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Staff access only. Contact your administrator for an account.
            </p>

            {/* Company endorsement, at a size that reads as attribution rather
                than as the page's own mark. */}
            <div className="flex items-center gap-3 border-t border-border/70 pt-5">
              <span className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                A system by
              </span>
              <Image
                src="/irs-logo.png"
                alt="iRS"
                width={432}
                height={200}
                priority
                className="h-6 w-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
