import { Badge } from "@/components/ui/badge";
import type { ReminderRunStatus } from "@/lib/types";

const LABELS: Record<ReminderRunStatus, string> = {
  pending: "Queued",
  processing: "Sending",
  completed: "Completed",
  partial: "Partially sent",
  failed: "Failed",
};

export function ReminderRunStatusBadge({
  status,
}: {
  status: ReminderRunStatus;
}) {
  const variant =
    status === "completed"
      ? "success"
      : status === "partial" || status === "processing" || status === "pending"
        ? "warning"
        : "destructive";

  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}
