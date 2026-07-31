import { Badge } from "@/components/ui/badge";
import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  type RequestCategory,
  type RequestPriority,
  type RequestStatus,
} from "@/lib/types";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const STATUS_VARIANTS: Record<RequestStatus, BadgeVariant> = {
  submitted: "secondary",
  pending_approval: "warning",
  approved: "default",
  in_progress: "default",
  completed: "success",
  rejected: "destructive",
};

const PRIORITY_VARIANTS: Record<RequestPriority, BadgeVariant> = {
  low: "outline",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

/** The one place a request status becomes a badge. */
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{REQUEST_STATUS_LABELS[status]}</Badge>;
}

/** Low is outlined rather than coloured: it should not compete for attention. */
export function RequestPriorityBadge({ priority }: { priority: RequestPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]}>
      {REQUEST_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function RequestCategoryBadge({ category }: { category: RequestCategory }) {
  return <Badge variant="outline">{REQUEST_CATEGORY_LABELS[category]}</Badge>;
}
