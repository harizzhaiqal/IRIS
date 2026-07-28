"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Paperclip, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { EFFECTIVENESS_LABELS, type Effectiveness } from "@/lib/types";
import { calculateMinutes, hhmmToMinutes, minutesToHHMM } from "@/lib/utils/duration";
import {
  trainingEntryFormSchema,
  type TrainingEntryFormValues,
} from "@/lib/validation/training";
import { attachFile, removeAttachment, saveTrainingEntry } from "../actions";

export type ExistingAttachment = {
  id: string;
  file_name: string;
};

export type EntryFormDefaults = {
  recordId?: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
  hours: string;
  overrideReason: string;
  location: string;
  trainerProvider: string;
  effectiveness?: Effectiveness;
  remarks: string;
};

const EFFECTIVENESS_OPTIONS: Effectiveness[] = [
  "effective",
  "average",
  "not_effective",
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function EntryForm({
  month,
  year,
  userId,
  defaults,
  existingAttachments,
}: {
  month: number;
  year: number;
  userId: string;
  defaults: EntryFormDefaults;
  existingAttachments: ExistingAttachment[];
}) {
  const router = useRouter();
  const isEditing = Boolean(defaults.recordId);

  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracks whether the employee has typed their own figure, so the calculated
  // duration stops overwriting it.
  const hoursTouched = useRef(isEditing);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<TrainingEntryFormValues>({
    resolver: zodResolver(trainingEntryFormSchema),
    defaultValues: {
      title: defaults.title,
      startDatetime: defaults.startDatetime,
      endDatetime: defaults.endDatetime,
      hours: defaults.hours,
      overrideReason: defaults.overrideReason,
      location: defaults.location,
      trainerProvider: defaults.trainerProvider,
      effectiveness: defaults.effectiveness,
      remarks: defaults.remarks,
    },
  });

  const startDatetime = watch("startDatetime");
  const endDatetime = watch("endDatetime");
  const hours = watch("hours");

  const calculatedMinutes =
    startDatetime && endDatetime
      ? calculateMinutes(startDatetime, endDatetime)
      : 0;
  const recordedMinutes = hhmmToMinutes(hours ?? "") ?? 0;
  const isOverridden =
    calculatedMinutes > 0 && recordedMinutes !== calculatedMinutes;

  useEffect(() => {
    if (hoursTouched.current) return;
    if (calculatedMinutes <= 0) return;

    setValue("hours", minutesToHHMM(calculatedMinutes));
  }, [calculatedMinutes, setValue]);

  async function uploadFiles(recordId: string): Promise<string | null> {
    if (files.length === 0) return null;

    const supabase = createClient();

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return `${file.name} is larger than 10 MB.`;
      }

      // The first path segment must be the owner's id: the storage policy
      // authorizes on it.
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/${recordId}/${crypto.randomUUID()}-${safeName}`;

      const { error } = await supabase.storage
        .from("training-attachments")
        .upload(path, file);

      if (error) return `Could not upload ${file.name}.`;

      const attached = await attachFile({
        recordId,
        filePath: path,
        fileName: file.name,
        fileSize: file.size,
      });

      if (!attached.ok) return attached.error;
    }

    return null;
  }

  async function persist(values: TrainingEntryFormValues) {
    const result = await saveTrainingEntry({
      recordId: defaults.recordId,
      month,
      year,
      title: values.title,
      startDatetime: values.startDatetime,
      endDatetime: values.endDatetime,
      recordedMinutes: hhmmToMinutes(values.hours) ?? 0,
      overrideReason: values.overrideReason || null,
      location: values.location || null,
      trainerProvider: values.trainerProvider || null,
      effectiveness: values.effectiveness ?? null,
      remarks: values.remarks || null,
    });

    if (!result.ok) return { error: result.error };

    const uploadError = await uploadFiles(result.data.recordId);
    if (uploadError) return { error: uploadError };

    return { error: null };
  }

  function submitAndClose(values: TrainingEntryFormValues) {
    setFormError(null);
    setIsBusy(true);

    void persist(values).then(({ error }) => {
      setIsBusy(false);
      if (error) {
        setFormError(error);
        return;
      }
      router.push(`/training?month=${month}&year=${year}`);
      router.refresh();
    });
  }

  function submitAndAddAnother(values: TrainingEntryFormValues) {
    setFormError(null);
    setIsBusy(true);

    void persist(values).then(({ error }) => {
      setIsBusy(false);
      if (error) {
        setFormError(error);
        return;
      }

      reset({
        title: "",
        startDatetime: "",
        endDatetime: "",
        hours: "",
        overrideReason: "",
        location: values.location,
        trainerProvider: "",
        effectiveness: undefined,
        remarks: "",
      });
      hoursTouched.current = false;
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  async function dropExisting(attachmentId: string) {
    setIsBusy(true);
    const result = await removeAttachment(attachmentId);
    setIsBusy(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form className="space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="title">Training title</Label>
            <Input
              id="title"
              placeholder="Secure coding practices workshop"
              aria-invalid={Boolean(errors.title)}
              {...register("title")}
            />
            {errors.title ? (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDatetime">Started</Label>
              <Input
                id="startDatetime"
                type="datetime-local"
                aria-invalid={Boolean(errors.startDatetime)}
                {...register("startDatetime")}
              />
              {errors.startDatetime ? (
                <p className="text-sm text-destructive">
                  {errors.startDatetime.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDatetime">Ended</Label>
              <Input
                id="endDatetime"
                type="datetime-local"
                aria-invalid={Boolean(errors.endDatetime)}
                {...register("endDatetime")}
              />
              {errors.endDatetime ? (
                <p className="text-sm text-destructive">
                  {errors.endDatetime.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hours">Hours recorded</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="hours"
                className="w-32 tabular-nums"
                placeholder="HH:MM"
                aria-invalid={Boolean(errors.hours)}
                {...register("hours", {
                  onChange: () => {
                    hoursTouched.current = true;
                  },
                })}
              />
              {calculatedMinutes > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Calculated from the dates:{" "}
                  <span className="font-medium tabular-nums">
                    {minutesToHHMM(calculatedMinutes)}
                  </span>
                </p>
              ) : null}
            </div>
            {errors.hours ? (
              <p className="text-sm text-destructive">{errors.hours.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Multi-day courses count their daily session window once per day.
                Lower the figure if breaks should not count.
              </p>
            )}
          </div>

          {isOverridden ? (
            <div className="space-y-2 rounded-md border border-warning/50 bg-warning/5 p-3">
              <Label htmlFor="overrideReason">
                Why does this differ from the calculated duration?
              </Label>
              <Textarea
                id="overrideReason"
                placeholder="Excludes the one-hour lunch break on each of the two days."
                aria-invalid={Boolean(errors.overrideReason)}
                {...register("overrideReason")}
              />
              {errors.overrideReason ? (
                <p className="text-sm text-destructive">
                  {errors.overrideReason.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your reviewer sees both figures and this reason.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Online — Microsoft Teams"
                {...register("location")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainerProvider">Trainer or provider</Label>
              <Input
                id="trainerProvider"
                placeholder="SIRIM Training Services"
                {...register("trainerProvider")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>How effective was it?</Label>
            <Controller
              control={control}
              name="effectiveness"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  className="flex flex-wrap gap-x-6 gap-y-2"
                >
                  {EFFECTIVENESS_OPTIONS.map((option) => (
                    <div key={option} className="flex items-center gap-2">
                      <RadioGroupItem value={option} id={`effectiveness-${option}`} />
                      <Label
                        htmlFor={`effectiveness-${option}`}
                        className="font-normal"
                      >
                        {EFFECTIVENESS_LABELS[option]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              placeholder="How you have applied this, or plan to."
              {...register("remarks")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="attachments">Supporting documents</Label>
            <p className="text-sm text-muted-foreground">
              Certificate or attendance sheet. Not required to save, though your
              reviewer may ask for one.
            </p>
          </div>

          {existingAttachments.length > 0 ? (
            <ul className="space-y-2">
              {existingAttachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{attachment.file_name}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void dropExisting(attachment.id)}
                    aria-label={`Remove ${attachment.file_name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <Input
            id="attachments"
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            onChange={(event) =>
              setFiles(Array.from(event.currentTarget.files ?? []))
            }
          />

          {files.length > 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-3.5 w-3.5" />
              {files.length === 1
                ? "1 file will be uploaded when you save"
                : `${files.length} files will be uploaded when you save`}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleSubmit(submitAndClose)} disabled={isBusy}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEditing ? "Save changes" : "Save as draft"}
        </Button>

        {!isEditing ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleSubmit(submitAndAddAnother)}
            disabled={isBusy}
          >
            Save and add another
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/training?month=${month}&year=${year}`)}
          disabled={isBusy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
