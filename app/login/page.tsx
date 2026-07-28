import { GraduationCap } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — IRIS" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">IRIS</h1>
          <p className="text-sm text-muted-foreground">
            IRS Records and Insight System
          </p>
        </div>

        <LoginForm redirectTo={searchParams.redirectTo} />
      </div>
    </main>
  );
}
