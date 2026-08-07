"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PlayCircle, PackageCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RequestStatus } from "@/lib/types";
import { decideRequest } from "../actions";

type Decision = "approve" | "reject" | "start" | "complete";

/**
 * Which moves are offered depends on where the request has got to. Kept in one
 * table so the buttons and the server action cannot drift apart — the action
 * enforces the same set, and the database enforces it again.
 */
const AVAILABLE: Record<Decision, RequestStatus[]> = {
  approve: ["pending_approval"],
  reject: ["pending_approval"],
  start: ["submitted", "approved"],
  complete: ["approved", "in_progress"],
};

export function ReviewPanel({
  requestId,
  status,
  isOwnRequest,
}: {
  requestId: number;
  status: RequestStatus;
  isOwnRequest: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offered = (Object.keys(AVAILABLE) as Decision[]).filter((decision) =>
    AVAILABLE[decision].includes(status),
  );

  if (isOwnRequest) {
    return (
      <p className="text-sm text-muted-foreground">
        This is your own request, so it is decided by someone else.
      </p>
    );
  }

  if (offered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No further action is needed on this request.
      </p>
    );
  }

  async function act(decision: Decision) {
    setError(null);

    if (decision === "reject" && comment.trim().length === 0) {
      setError("Give a reason when rejecting a request.");
      return;
    }

    setBusy(decision);
    const result = await decideRequest({ requestId, decision, comment: comment.trim() });
    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setComment("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="review-comment">Comment</Label>
        <Textarea
          id="review-comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional note for the request history."
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {offered.includes("approve") ? (
          <Button onClick={() => act("approve")} disabled={busy !== null}>
            {busy === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Approve
          </Button>
        ) : null}

        {offered.includes("start") ? (
          <Button
            variant="outline"
            onClick={() => act("start")}
            disabled={busy !== null}
          >
            {busy === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Mark in progress
          </Button>
        ) : null}

        {offered.includes("complete") ? (
          <Button
            variant="outline"
            onClick={() => act("complete")}
            disabled={busy !== null}
          >
            {busy === "complete" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            Mark completed
          </Button>
        ) : null}

        {offered.includes("reject") ? (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => act("reject")}
            disabled={busy !== null}
          >
            {busy === "reject" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Reject
          </Button>
        ) : null}
      </div>
    </div>
  );
}
