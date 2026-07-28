import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "destructive" | "success";
}) {
  const toneClass = {
    default: "",
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
  }[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon ? (
            <Icon className={cn("h-4 w-4 text-muted-foreground", toneClass)} />
          ) : null}
        </div>

        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>
          {value}
        </p>

        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
