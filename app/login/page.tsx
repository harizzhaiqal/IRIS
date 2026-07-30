import { Honeycomb } from "@/components/brand/honeycomb";
import { IrisLogo } from "@/components/brand/iris-logo";
import { IrsLogo } from "@/components/brand/irs-logo";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — IRIS" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-secondary/60 p-6">
      <Honeycomb />

      <div className="relative w-full max-w-sm space-y-8">
        <div className="space-y-4">
          <div className="flex justify-center">
            <IrisLogo size="lg" />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            IRS Records and Insight System
          </p>
        </div>

        <LoginForm redirectTo={searchParams.redirectTo} />

        <div className="space-y-5">
          <p className="text-center text-xs text-muted-foreground">
            Staff access only. Contact your administrator for an account.
          </p>

          {/* Company endorsement: the iRS logo sits below a rule, at a size
              that reads as attribution rather than as the page's own mark. */}
          <div className="flex flex-col items-center gap-2.5 border-t border-border/70 pt-5">
            <span className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
              A system by
            </span>
            <IrsLogo className="h-7 w-auto" priority />
          </div>
        </div>
      </div>
    </main>
  );
}
