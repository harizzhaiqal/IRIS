"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";

import { useGlobalPending } from "@/components/app-shell/loading-overlay";
import { Button } from "@/components/ui/button";
import { withdrawNilReturn } from "./actions";

export function WithdrawNilReturn({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useGlobalPending(pending, "Withdrawing nil return…");

  function run() {
    setError(null);

    startTransition(async () => {
      const result = await withdrawNilReturn({ month, year });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="h-4 w-4" />
        )}
        Withdraw nil return
      </Button>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
