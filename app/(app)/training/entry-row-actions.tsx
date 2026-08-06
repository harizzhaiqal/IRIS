"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { useGlobalPending } from "@/components/app-shell/loading-overlay";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteTrainingEntry } from "./actions";

export function EntryRowActions({
  recordId,
  title,
  month,
  year,
  afterDeleteHref,
}: {
  recordId: number;
  title: string;
  month: number;
  year: number;
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useGlobalPending(pending, "Deleting entry…");

  function runDelete() {
    setError(null);

    startTransition(async () => {
      const result = await deleteTrainingEntry(recordId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      if (afterDeleteHref) {
        router.replace(afterDeleteHref);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" asChild>
        <Link
          href={`/training/new?recordId=${recordId}&month=${month}&year=${year}`}
          aria-label={`Edit ${title}`}
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Remove ${title}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this entry</DialogTitle>
            <DialogDescription>
              {title} will be removed from this month, along with any documents
              attached to it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={runDelete} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remove entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
