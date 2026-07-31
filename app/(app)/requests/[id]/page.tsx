import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, Paperclip, Sparkles } from "lucide-react";

import {
  RequestCategoryBadge,
  RequestPriorityBadge,
  RequestStatusBadge,
} from "@/components/requests/request-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireProfile } from "@/lib/auth";
import { getRequest } from "@/lib/queries/requests";
import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITY_LABELS,
  type RequestCategory,
  type RequestPriority,
} from "@/lib/types";
import { formatCost } from "@/lib/utils/money";
import { CommentForm } from "./comment-form";
import { ReviewPanel } from "./review-panel";

export const metadata = { title: "Request — IRIS" };

type StoredSuggestion = {
  category?: RequestCategory;
  department?: string;
  priority?: RequestPriority;
  approvalRequired?: boolean;
  reason?: string;
};

function formatMoment(value: string): string {
  return new Date(value).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const requestId = Number(params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();

  // RLS decides reach, so anything the viewer may not see reads as missing.
  const request = await getRequest(requestId);
  if (!request) notFound();

  const isOwnRequest = request.requester?.id === profile.id;
  const isReviewer = profile.role !== "staff";

  const suggestion = (request.ai_suggestion ?? null) as StoredSuggestion | null;

  // Worth showing plainly: the assistant proposed one thing and the requester
  // filed another.
  const changedFromSuggestion = suggestion
    ? [
        suggestion.category && suggestion.category !== request.category
          ? `category to ${REQUEST_CATEGORY_LABELS[request.category]}`
          : null,
        suggestion.priority && suggestion.priority !== request.priority
          ? `priority to ${REQUEST_PRIORITY_LABELS[request.priority]}`
          : null,
        suggestion.approvalRequired !== undefined &&
        suggestion.approvalRequired !== request.approval_required
          ? `approval to ${request.approval_required ? "required" : "not required"}`
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/requests">
            <ArrowLeft className="h-4 w-4" />
            Requests
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {request.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Raised by {request.requester?.full_name ?? "Unknown"}
              {request.requester?.department?.name
                ? ` · ${request.requester.department.name}`
                : ""}{" "}
              · {formatMoment(request.created_time)}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <RequestStatusBadge status={request.status} />
            <RequestPriorityBadge priority={request.priority} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="whitespace-pre-wrap text-sm">{request.description}</p>

          <Separator />

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Category">
              <RequestCategoryBadge category={request.category} />
            </Field>
            <Field label="Priority">
              <RequestPriorityBadge priority={request.priority} />
            </Field>
            <Field label="Estimated cost">
              {request.estimated_cost_cents > 0
                ? formatCost(request.estimated_cost_cents)
                : "No cost"}
            </Field>
            <Field label="Department">
              {request.assigned_department ?? "Not assigned"}
            </Field>
            <Field label="Approval">
              {request.approval_required ? "Required" : "Not required"}
            </Field>
            <Field label="Attachment">
              {request.attachment_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  {request.attachment_name}
                </span>
              ) : (
                <span className="text-muted-foreground">None attached</span>
              )}
            </Field>
          </dl>
        </CardContent>
      </Card>

      {suggestion ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI suggestion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Category">
                {suggestion.category
                  ? REQUEST_CATEGORY_LABELS[suggestion.category]
                  : "—"}
              </Field>
              <Field label="Department">{suggestion.department ?? "—"}</Field>
              <Field label="Priority">
                {suggestion.priority
                  ? REQUEST_PRIORITY_LABELS[suggestion.priority]
                  : "—"}
              </Field>
              <Field label="Approval required">
                {suggestion.approvalRequired === undefined
                  ? "—"
                  : suggestion.approvalRequired
                    ? "Yes"
                    : "No"}
              </Field>
            </dl>

            {suggestion.reason ? (
              <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
            ) : null}

            {changedFromSuggestion.length > 0 ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                The requester changed the {changedFromSuggestion.join(", ")}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {request.reviewed_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <RequestStatusBadge status={request.status} /> by{" "}
              {request.reviewer?.full_name ?? "a reviewer"} on{" "}
              {formatMoment(request.reviewed_at)}
            </p>
            {request.review_comment ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {request.review_comment}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isReviewer ? (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewPanel
              requestId={request.id}
              status={request.status}
              isOwnRequest={isOwnRequest}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {request.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet. Add one to keep everyone in the loop.
            </p>
          ) : (
            <ul className="space-y-4">
              {request.comments.map((comment) => (
                <li key={comment.id} className="space-y-1">
                  <p className="text-sm font-medium">
                    {comment.author?.full_name ?? "Unknown"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatMoment(comment.created_time)}
                    </span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {comment.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <Separator />

          <CommentForm requestId={request.id} />
        </CardContent>
      </Card>
    </div>
  );
}
