"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { retryFailedDeliveries } from "../../actions";

export function RetryButton({ runId }: { runId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function retry() {
    setMessage(null);
    startTransition(async () => {
      const result = await retryFailedDeliveries(runId);
      setMessage(
        result.ok
          ? `${result.data.queued} failed email${result.data.queued === 1 ? "" : "s"} queued. The scheduler will retry shortly.`
          : result.error,
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={retry} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Retry failed only
      </Button>
      {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}
    </div>
  );
}
