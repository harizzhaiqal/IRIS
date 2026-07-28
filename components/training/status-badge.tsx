import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type SubmissionStatus } from "@/lib/types";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const STATUS_VARIANTS: Record<SubmissionStatus, BadgeVariant> = {
  draft: "secondary",
  submitted_pending_hod: "warning",
  hod_verified: "warning",
  approved: "success",
  returned_by_hod: "destructive",
  rejected: "destructive",
};

/**
 * The one place a submission status becomes a badge. A null status means the
 * employee has not opened the month at all.
 */
export function StatusBadge({
  status,
  isLate = false,
}: {
  status: SubmissionStatus | null;
  isLate?: boolean;
}) {
  if (!status) {
    return <Badge variant="outline">Not started</Badge>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
      {isLate ? <Badge variant="outline">Late</Badge> : null}
    </span>
  );
}
