import { Badge } from "@/components/ui/badge";
import type { CommissionStatus } from "@/lib/types";

export function CommissionStatusBadge({
  status,
}: {
  status: CommissionStatus;
}) {
  const variant =
    status === "Acknowledged"
      ? "success"
      : status === "Not Viewed"
        ? "warning"
        : status === "PDF Uploaded"
          ? "outline"
          : "secondary";

  return <Badge variant={variant}>{status}</Badge>;
}

export function EmailStatusBadge({ sentAt }: { sentAt?: string }) {
  return (
    <Badge variant={sentAt ? "secondary" : "outline"}>
      {sentAt ? "Sent" : "Not sent"}
    </Badge>
  );
}

export function ViewStatusBadge({ viewedAt }: { viewedAt?: string }) {
  return (
    <Badge variant={viewedAt ? "secondary" : "warning"}>
      {viewedAt ? "Viewed" : "Not viewed"}
    </Badge>
  );
}

export function AcknowledgementStatusBadge({
  acknowledgedAt,
}: {
  acknowledgedAt?: string;
}) {
  return (
    <Badge variant={acknowledgedAt ? "success" : "outline"}>
      {acknowledgedAt ? "Acknowledged" : "Pending"}
    </Badge>
  );
}
