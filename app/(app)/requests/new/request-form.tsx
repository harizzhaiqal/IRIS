"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Paperclip, Sparkles, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RequestSuggestion } from "@/lib/ai/suggestRequest";
import { createClient } from "@/lib/supabase/client";
import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_CATEGORY_ORDER,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_ORDER,
} from "@/lib/types";
import { parseCostToCents } from "@/lib/utils/money";
import {
  requestFormSchema,
  type RequestFormValues,
} from "@/lib/validation/requests";
import { createRequest, generateSuggestion } from "../actions";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function RequestForm({ userId }: { userId: number }) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<RequestSuggestion | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "other",
      estimatedCost: "",
      priority: "normal",
      assignedDepartment: "",
      approvalRequired: true,
    },
  });

  const description = watch("description");

  async function askForSuggestion() {
    setFormError(null);

    if (!description || description.trim().length < 10) {
      setFormError("Describe what you need first, then ask for a suggestion.");
      return;
    }

    setIsSuggesting(true);
    const result = await generateSuggestion({ description });
    setIsSuggesting(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    // Pre-filled, not locked: every field stays editable afterwards.
    setSuggestion(result.data);
    setValue("category", result.data.category, { shouldValidate: true });
    setValue("priority", result.data.priority, { shouldValidate: true });
    setValue("assignedDepartment", result.data.department, { shouldValidate: true });
    setValue("approvalRequired", result.data.approvalRequired);
  }

  async function uploadAttachment(): Promise<
    { path: string; name: string } | { error: string } | null
  > {
    if (!file) return null;

    if (file.size > MAX_FILE_BYTES) {
      return { error: `${file.name} is larger than 10 MB.` };
    }

    const supabase = createClient();

    // The first path segment must be the owner's id: the storage policy
    // authorizes on it.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from("request-attachments")
      .upload(path, file);

    if (error) return { error: `Could not upload ${file.name}.` };

    return { path, name: file.name };
  }

  async function onSubmit(values: RequestFormValues) {
    setFormError(null);
    setIsBusy(true);

    const uploaded = await uploadAttachment();
    if (uploaded && "error" in uploaded) {
      setIsBusy(false);
      setFormError(uploaded.error);
      return;
    }

    const result = await createRequest({
      title: values.title,
      description: values.description,
      category: values.category,
      estimatedCostCents: parseCostToCents(values.estimatedCost) ?? 0,
      priority: values.priority,
      assignedDepartment: values.assignedDepartment || null,
      approvalRequired: values.approvalRequired,
      attachmentPath: uploaded?.path ?? null,
      attachmentName: uploaded?.name ?? null,
      aiSuggestion: suggestion,
    });

    setIsBusy(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(`/requests/${result.data.requestId}`);
    router.refresh();
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="title">Request title</Label>
            <Input
              id="title"
              placeholder="Second monitor for development work"
              aria-invalid={Boolean(errors.title)}
              {...register("title")}
            />
            {errors.title ? (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              placeholder="I need a new monitor because my current monitor is too small."
              aria-invalid={Boolean(errors.description)}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={askForSuggestion}
                disabled={isSuggesting || isBusy}
              >
                {isSuggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Suggest with AI
              </Button>
              <p className="text-xs text-muted-foreground">
                Fills in the fields below from your description. You can change
                anything it suggests.
              </p>
            </div>
          </div>

          {suggestion ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Suggestion applied</p>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd>{REQUEST_CATEGORY_LABELS[suggestion.category]}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{suggestion.department}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd>{REQUEST_PRIORITY_LABELS[suggestion.priority]}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Approval required</dt>
                  <dd>{suggestion.approvalRequired ? "Yes" : "No"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                {suggestion.reason}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_CATEGORY_ORDER.map((value) => (
                        <SelectItem key={value} value={value}>
                          {REQUEST_CATEGORY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_PRIORITY_ORDER.map((value) => (
                        <SelectItem key={value} value={value}>
                          {REQUEST_PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimated cost</Label>
              <Input
                id="estimatedCost"
                inputMode="decimal"
                placeholder="890.00"
                aria-invalid={Boolean(errors.estimatedCost)}
                {...register("estimatedCost")}
              />
              {errors.estimatedCost ? (
                <p className="text-sm text-destructive">
                  {errors.estimatedCost.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  In ringgit. Leave blank if there is no cost.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedDepartment">Department</Label>
              <Input
                id="assignedDepartment"
                placeholder="IT"
                aria-invalid={Boolean(errors.assignedDepartment)}
                {...register("assignedDepartment")}
              />
              <p className="text-xs text-muted-foreground">
                The team that will handle this.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Controller
              control={control}
              name="approvalRequired"
              render={({ field }) => (
                <Checkbox
                  id="approvalRequired"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <div className="space-y-1">
              <Label htmlFor="approvalRequired" className="font-medium">
                Approval required
              </Label>
              <p className="text-sm text-muted-foreground">
                Requests needing approval wait for a manager or admin. Anything
                else goes straight to the handling team.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachment">Attachment</Label>

            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove attachment</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  id="attachment"
                  type="file"
                  className="max-w-sm"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
                <Upload className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Optional. A photo or quote helps whoever picks this up. Up to 10 MB.
            </p>
          </div>
        </CardContent>
      </Card>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isBusy}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit request
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/requests")}
          disabled={isBusy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
