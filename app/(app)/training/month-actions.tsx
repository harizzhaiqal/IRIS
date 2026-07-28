"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Send, SlashSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { declareNilReturn, submitMonth } from "./actions";

export function MonthActions({
  month,
  year,
  entryCount,
  entriesMissingAttachments,
}: {
  month: number;
  year: number;
  entryCount: number;
  entriesMissingAttachments: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nilOpen, setNilOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runSubmit() {
    setError(null);
    setIsSubmitting(true);

    startTransition(async () => {
      const result = await submitMonth({ month, year });
      setIsSubmitting(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmOpen(false);
      router.refresh();
    });
  }

  function runNilReturn() {
    setError(null);

    startTransition(async () => {
      const result = await declareNilReturn({ month, year });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNilOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setConfirmOpen(true)} disabled={entryCount === 0}>
          <Send className="h-4 w-4" />
          Submit month
        </Button>

        {entryCount === 0 ? (
          <Button variant="outline" onClick={() => setNilOpen(true)}>
            <SlashSquare className="h-4 w-4" />
            Declare nil return
          </Button>
        ) : null}
      </div>

      {error && !confirmOpen && !nilOpen ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this month for verification</DialogTitle>
            <DialogDescription>
              Your head of department reviews it first, then HR. You will not be
              able to edit it unless it is sent back to you.
            </DialogDescription>
          </DialogHeader>

          {entriesMissingAttachments.length > 0 ? (
            <div className="flex gap-3 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">
                  {entriesMissingAttachments.length === 1
                    ? "One entry has no supporting document"
                    : `${entriesMissingAttachments.length} entries have no supporting document`}
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {entriesMissingAttachments.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  You can still submit, though your reviewer may ask for a
                  certificate or attendance sheet.
                </p>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runSubmit} disabled={pending || isSubmitting}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit for verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nilOpen} onOpenChange={setNilOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declare a nil return</DialogTitle>
            <DialogDescription>
              This records that you had no training this month, so HR can tell it
              apart from a month you simply have not filled in yet. It still goes
              through the usual verification.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setNilOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runNilReturn} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Declare nil return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
