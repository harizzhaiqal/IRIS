import Link from "next/link";
import { GraduationCap, LogOut } from "lucide-react";

import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">IRIS</p>
            <p className="text-xs text-muted-foreground">Training records</p>
          </div>
        </div>

        <div className="flex-1 p-3">
          <SidebarNav role={profile.role} />
        </div>

        <div className="border-t p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-medium">{profile.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABELS[profile.role]}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b bg-background px-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">IRIS</span>
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </header>

        <div className="border-b bg-background px-4 py-2 lg:hidden">
          <SidebarNav role={profile.role} />
        </div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
