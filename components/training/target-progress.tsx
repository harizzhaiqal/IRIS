import { Progress } from "@/components/ui/progress";
import { minutesToHHMM } from "@/lib/utils/duration";
import { percentOfTarget, progressPercent, hoursToMinutes } from "@/lib/utils/targets";
import { cn } from "@/lib/utils";

/**
 * Approved hours against a target. Pending hours are shown as a separate
 * figure, never folded into the bar, so an unverified total is never mistaken
 * for progress.
 */
export function TargetProgress({
  label,
  approvedMinutes,
  targetHours,
  pendingMinutes = 0,
  className,
}: {
  label: string;
  approvedMinutes: number;
  targetHours: number;
  pendingMinutes?: number;
  className?: string;
}) {
  const percent = percentOfTarget(approvedMinutes, targetHours);
  const met = approvedMinutes >= hoursToMinutes(targetHours);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {minutesToHHMM(approvedMinutes)}
          <span className="text-muted-foreground">
            {" / "}
            {minutesToHHMM(hoursToMinutes(targetHours))}
          </span>
        </span>
      </div>

      <Progress
        value={progressPercent(approvedMinutes, targetHours)}
        indicatorClassName={met ? "bg-success" : undefined}
        aria-label={`${label}: ${percent}% of target`}
      />

      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className={cn("tabular-nums", met && "text-success")}>
          {percent}% of target
        </span>
        {pendingMinutes > 0 ? (
          <span className="tabular-nums">
            {minutesToHHMM(pendingMinutes)} awaiting verification
          </span>
        ) : null}
      </div>
    </div>
  );
}
