"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  ReceiptText,
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

/**
 * Ordered dashboard, training, requests, reminders.
 *
 * Two pairs of entries point at the same page under different names, because
 * the same page means different things depending on who opens it: for staff and
 * a HOD /requests is their own list, for HR and the CEO it is the company
 * record. The roles are disjoint, so only one of each pair is ever rendered.
 */
const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["staff", "hod", "hr_admin", "ceo"],
  },
  {
    href: "/training/team",
    label: "Training submissions",
    icon: Users,
    roles: ["hod"],
  },
  {
    href: "/training",
    label: "My training",
    icon: NotebookPen,
    roles: ["staff", "hod"],
  },
  {
    href: "/training/submissions",
    label: "Training",
    icon: NotebookPen,
    roles: ["hr_admin", "ceo"],
  },
  {
    href: "/requests",
    label: "Requests",
    icon: Inbox,
    roles: ["staff", "hod"],
  },
  {
    href: "/requests",
    label: "Requests",
    icon: ClipboardCheck,
    roles: ["hr_admin", "ceo"],
  },
  {
    href: "/commission",
    label: "Commission",
    icon: ReceiptText,
    roles: ["staff", "hod", "hr_admin", "ceo"],
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
            // Two entries can share an href under different labels, so the
            // href alone is not a stable key.
            key={`${item.href}-${item.label}`}
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
