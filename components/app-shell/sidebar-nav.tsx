"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
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
    roles: ["staff", "hod", "hr_admin"],
  },
  {
    href: "/training",
    label: "My training",
    icon: NotebookPen,
    roles: ["staff", "hod", "hr_admin"],
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
