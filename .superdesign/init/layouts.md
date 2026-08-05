# Shared Layouts

## RootLayout

- File: `app/layout.tsx`
- Description: Root HTML/body layout, local Geist fonts, Space Grotesk brand font, and global stylesheet.

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Space_Grotesk } from "next/font/google";

import "./globals.css";

/* The IRIS logo is set in Space Grotesk per the brand sheet. It is loaded only
   for the wordmark — the interface itself stays on Geist. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "IRIS — IRS Records and Insight System",
  description: "Internal staff workflow system for IRS Software Solution.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

## AppLayout

- File: `app/(app)/layout.tsx`
- Description: Authenticated application shell with desktop sidebar, mobile header, navigation, profile summary, and sign-out actions.

```tsx
import Link from "next/link";
import { LogOut } from "lucide-react";

import { SidebarHeader } from "@/components/app-shell/sidebar-header";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { IrisLogo } from "@/components/brand/iris-logo";
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
        <SidebarHeader />

        <div className="p-3">
          <SidebarNav role={profile.role} />

          <div className="mt-3 border-t pt-3">
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
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b bg-background px-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center">
            <IrisLogo size="sm" />
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
```

## SidebarHeader

- File: `components/app-shell/sidebar-header.tsx`
- Description: Sidebar masthead with the IRIS logo and product name.

```tsx
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
```

## SidebarNav

- File: `components/app-shell/sidebar-nav.tsx`
- Description: Role-aware navigation used by the desktop sidebar and mobile navigation band.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["staff", "hod", "hr_admin", "ceo"],
  },
  {
    href: "/training",
    label: "My training",
    icon: NotebookPen,
    roles: ["staff", "hod"],
  },
  {
    // For staff and a HOD this lists their own; for HR and the CEO it is the
    // company review queue. Same page, scoped by RLS.
    href: "/requests",
    label: "Requests",
    icon: Inbox,
    roles: ["staff", "hod", "hr_admin", "ceo"],
  },
  {
    href: "/training/team",
    label: "Team submissions",
    icon: Users,
    roles: ["hod"],
  },
  {
    href: "/training/submissions",
    label: "All submissions",
    icon: ClipboardCheck,
    roles: ["hr_admin", "ceo"],
  },
  {
    href: "/reminders",
    label: "Reminders",
    icon: BellRing,
    roles: ["hr_admin"],
  },
];

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          // /training must not light up while on /training/team.
          (pathname.startsWith(`${item.href}/`) &&
            !items.some(
              (other) =>
                other.href !== item.href && pathname.startsWith(other.href),
            ));

        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```


