"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addRequestComment } from "../actions";

export function CommentForm({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);

    if (body.trim().length === 0) {
      setError("Write a comment before adding it.");
      return;
    }

    setBusy(true);
    const result = await addRequestComment({ requestId, body: body.trim() });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="comment-body">Add a comment</Label>
        <Textarea
          id="comment-body"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Ask a question or leave an update."
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button size="sm" onClick={submit} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageSquarePlus className="h-4 w-4" />
        )}
        Add comment
      </Button>
    </div>
  );
}
