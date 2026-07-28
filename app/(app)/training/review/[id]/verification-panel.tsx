"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ThumbsUp, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SubmissionStatus, UserRole } from "@/lib/types";
import { reviewSubmission } from "../actions";

type Decision = "verify" | "return" | "approve" | "reject";

const COMMENT_REQUIRED: Decision[] = ["return", "reject"];

export function VerificationPanel({
  submissionId,
  status,
  viewerRole,
  isOwnSubmission,
}: {
  submissionId: string;
  status: SubmissionStatus;
  viewerRole: UserRole;
  isOwnSubmission: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeDecision, setActiveDecision] = useState<Decision | null>(null);

  // A reviewer never acts on their own month, whatever their role.
  const canVerifyAsHod =
    !isOwnSubmission &&
    viewerRole === "hod" &&
    status === "submitted_pending_hod";

  const canDecideAsHr =
    !isOwnSubmission && viewerRole === "hr_admin" && status === "hod_verified";

  function run(decision: Decision) {
    setError(null);

    if (COMMENT_REQUIRED.includes(decision) && !comment.trim()) {
      setActiveDecision(decision);
      setError("Explain what needs to change before sending this back.");
      return;
    }

    setActiveDecision(decision);

    startTransition(async () => {
      const result = await reviewSubmission({
        submissionId,
        decision,
        comment: comment.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setComment("");
      setActiveDecision(null);
      router.refresh();
    });
  }

  if (isOwnSubmission) {
    return (
      <p className="text-sm text-muted-foreground">
        This is your own submission, so it goes to another reviewer.
      </p>
    );
  }

  if (!canVerifyAsHod && !canDecideAsHr) {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "approved"
          ? "This month is fully approved. No further action is needed."
          : status === "submitted_pending_hod"
            ? "Waiting on the head of department to verify."
            : status === "hod_verified"
              ? "Verified by the head of department and waiting on HR."
              : "This month is back with the employee for revision."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="comment">
          Comment
          <span className="ml-1 font-normal text-muted-foreground">
            {canVerifyAsHod
              ? "— required to return this month"
              : "— required to reject this month"}
          </span>
        </Label>
        <Textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={
            canVerifyAsHod
              ? "What does the employee need to change?"
              : "Why is this being rejected?"
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canVerifyAsHod ? (
          <>
            <Button onClick={() => run("verify")} disabled={pending}>
              {pending && activeDecision === "verify" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Verify and send to HR
            </Button>
            <Button
              variant="outline"
              onClick={() => run("return")}
              disabled={pending}
            >
              {pending && activeDecision === "return" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Return to employee
            </Button>
          </>
        ) : null}

        {canDecideAsHr ? (
          <>
            <Button
              variant="success"
              onClick={() => run("approve")}
              disabled={pending}
            >
              {pending && activeDecision === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => run("reject")}
              disabled={pending}
            >
              {pending && activeDecision === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Reject
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {canVerifyAsHod
          ? "Verifying passes this to HR for final approval. Hours count toward compliance only once HR approves."
          : "Approving makes these hours count toward the employee's compliance totals."}
      </p>
    </div>
  );
}
