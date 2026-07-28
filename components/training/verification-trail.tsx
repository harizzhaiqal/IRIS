import { Check, CircleDashed, Clock, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SubmissionStatus } from "@/lib/types";

type StageState = "pending" | "waiting" | "done" | "returned";

type Stage = {
  title: string;
  state: StageState;
  actor: string | null;
  at: string | null;
  comment: string | null;
};

const STATE_STYLES: Record<
  StageState,
  { icon: typeof Check; dot: string; text: string }
> = {
  done: { icon: Check, dot: "bg-success text-success-foreground", text: "text-foreground" },
  waiting: { icon: Clock, dot: "bg-warning text-warning-foreground", text: "text-foreground" },
  returned: {
    icon: Undo2,
    dot: "bg-destructive text-destructive-foreground",
    text: "text-foreground",
  },
  pending: {
    icon: CircleDashed,
    dot: "bg-muted text-muted-foreground",
    text: "text-muted-foreground",
  },
};

function formatMoment(value: string | null): string | null {
  if (!value) return null;

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The two-stage verification history for a submission. Rendered identically
 * wherever a submission is shown, so employees and reviewers read the same
 * trail.
 */
export function VerificationTrail({
  status,
  submittedAt,
  hodName,
  hodVerifiedAt,
  hodComment,
  hrName,
  hrVerifiedAt,
  hrComment,
}: {
  status: SubmissionStatus;
  submittedAt: string | null;
  hodName: string | null;
  hodVerifiedAt: string | null;
  hodComment: string | null;
  hrName: string | null;
  hrVerifiedAt: string | null;
  hrComment: string | null;
}) {
  const submissionState: StageState =
    status === "draft" ? "pending" : "done";

  let hodState: StageState = "pending";
  if (status === "returned_by_hod") hodState = "returned";
  else if (status === "submitted_pending_hod") hodState = "waiting";
  else if (status === "hod_verified" || status === "approved" || status === "rejected")
    hodState = "done";

  let hrState: StageState = "pending";
  if (status === "rejected") hrState = "returned";
  else if (status === "hod_verified") hrState = "waiting";
  else if (status === "approved") hrState = "done";

  const stages: Stage[] = [
    {
      title: "Submitted by employee",
      state: submissionState,
      actor: null,
      at: submittedAt,
      comment: null,
    },
    {
      title:
        hodState === "returned" ? "Returned by HOD" : "HOD verification",
      state: hodState,
      actor: hodName,
      at: hodVerifiedAt,
      comment: hodComment,
    },
    {
      title: hrState === "returned" ? "Rejected by HR" : "HR approval",
      state: hrState,
      actor: hrName,
      at: hrVerifiedAt,
      comment: hrComment,
    },
  ];

  return (
    <ol className="space-y-4">
      {stages.map((stage, index) => {
        const style = STATE_STYLES[stage.state];
        const Icon = style.icon;
        const moment = formatMoment(stage.at);
        const isLast = index === stages.length - 1;

        return (
          <li key={stage.title} className="relative flex gap-3">
            {!isLast ? (
              <span
                className="absolute left-3 top-7 h-[calc(100%+0.25rem)] w-px bg-border"
                aria-hidden
              />
            ) : null}

            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                style.dot,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>

            <div className="min-w-0 flex-1 space-y-0.5 pb-1">
              <p className={cn("text-sm font-medium", style.text)}>
                {stage.title}
              </p>

              <p className="text-xs text-muted-foreground">
                {stage.state === "pending"
                  ? "Not yet reached"
                  : stage.state === "waiting"
                    ? "Awaiting review"
                    : [stage.actor, moment].filter(Boolean).join(" · ") ||
                      "Recorded"}
              </p>

              {stage.comment ? (
                <p className="mt-1.5 rounded-md bg-muted px-3 py-2 text-sm">
                  {stage.comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
