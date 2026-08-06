"use client";

import { useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useGlobalPending } from "@/components/app-shell/loading-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createReminderContext,
  interpolateReminder,
  REMINDER_PLACEHOLDERS,
} from "@/lib/reminders/template";
import type { ReminderSchedule } from "@/lib/types";
import {
  reminderFormSchema,
  type ReminderFormValues,
} from "@/lib/validation/reminders";
import { saveReminder, sendReminderTest } from "./actions";

const DEFAULT_VALUES: ReminderFormValues = {
  reminderId: null,
  name: "Monthly training record reminder",
  isEnabled: false,
  dayOfMonth: 28,
  sendTime: "09:00",
  timezone: "Asia/Kuala_Lumpur",
  audience: "all_active_employees",
  targetRoles: ["staff", "hod"],
  subject: "Monthly reminder: Update your training record for {{month_name}}",
  body: "Hi {{full_name}},\n\nThis is a friendly reminder to update and submit your Employee Training Record for {{month_name}} in IRIS.\n\nPlease complete the record before {{deadline_date}}. If you have already submitted it, no further action is required.\n\nThank you,\nHR Department",
  actionLabel: "Open IRIS",
  actionUrl: "/training",
  replyTo: "",
};

function formValues(schedule: ReminderSchedule | null): ReminderFormValues {
  if (!schedule) return DEFAULT_VALUES;

  return {
    reminderId: schedule.id,
    name: schedule.name,
    isEnabled: schedule.is_enabled,
    dayOfMonth: schedule.day_of_month,
    sendTime: schedule.send_time.slice(0, 5),
    timezone: "Asia/Kuala_Lumpur",
    audience: schedule.audience,
    targetRoles: schedule.target_roles.filter(
      (role): role is "staff" | "hod" => role === "staff" || role === "hod",
    ),
    subject: schedule.subject,
    body: schedule.body,
    actionLabel: schedule.action_label ?? "",
    actionUrl: schedule.action_url ?? "",
    replyTo: schedule.reply_to ?? "",
  };
}

export function ReminderForm({
  schedule,
  testEmail,
  deadlineDay,
  appUrl,
}: {
  schedule: ReminderSchedule | null;
  testEmail: string;
  deadlineDay: number;
  appUrl: string;
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  useGlobalPending(isSaving, "Saving reminder…");
  useGlobalPending(isTesting, "Sending test…");
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const {
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    trigger,
    watch,
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: formValues(schedule),
  });

  const watchedSubject = watch("subject");
  const watchedBody = watch("body");
  const watchedActionLabel = watch("actionLabel");
  const context = useMemo(() => {
    const malaysiaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const periodStart = `${malaysiaNow.getUTCFullYear()}-${String(malaysiaNow.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return createReminderContext({
      fullName: "Aina Example",
      periodStart,
      deadlineDay,
      irisUrl: appUrl,
    });
  }, [appUrl, deadlineDay]);

  function onSave(values: ReminderFormValues) {
    setMessage(null);
    startSaving(async () => {
      const result = await saveReminder(values);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setMessage({ type: "success", text: "Reminder saved." });
      router.push(`/reminders/${result.data.reminderId}`);
      router.refresh();
    });
  }

  async function onTest() {
    setMessage(null);
    const valid = await trigger();
    if (!valid) return;

    startTesting(async () => {
      const result = await sendReminderTest(getValues());
      setMessage(
        result.ok
          ? { type: "success", text: `Test email sent to ${testEmail}.` }
          : { type: "error", text: result.error },
      );
    });
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit(onSave)}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule and recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Reminder name</Label>
                <Input id="name" {...register("name")} />
                {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
              </div>

              <Controller
                control={control}
                name="isEnabled"
                render={({ field }) => (
                  <div className="flex items-start gap-3 rounded-md border p-4">
                    <Checkbox
                      id="isEnabled"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="isEnabled">Enable automatic sending</Label>
                      <p className="text-sm text-muted-foreground">
                        Keep this paused until the sender domain is configured and a test email succeeds.
                      </p>
                    </div>
                  </div>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth">Day of month</Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min={1}
                    max={28}
                    {...register("dayOfMonth", { valueAsNumber: true })}
                  />
                  {errors.dayOfMonth ? <p className="text-sm text-destructive">Choose day 1 to 28.</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sendTime">Sending time</Label>
                  <Input id="sendTime" type="time" {...register("sendTime")} />
                </div>
                <div className="space-y-2">
                  <Label>Time zone</Label>
                  <Input value="Malaysia (UTC+8)" disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">Who should receive it?</Label>
                <Controller
                  control={control}
                  name="audience"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="audience"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_active_employees">All active employees</SelectItem>
                        <SelectItem value="incomplete_training">Only employees who have not submitted this month</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <Controller
                control={control}
                name="targetRoles"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Included roles</Label>
                    <div className="flex flex-wrap gap-5 rounded-md border p-3">
                      {(["staff", "hod"] as const).map((role) => (
                        <label key={role} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(role)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked === true
                                  ? Array.from(new Set([...field.value, role]))
                                  : field.value.filter((value) => value !== role),
                              )
                            }
                          />
                          {role === "staff" ? "Staff" : "Heads of department"}
                        </label>
                      ))}
                    </div>
                    {errors.targetRoles ? <p className="text-sm text-destructive">{errors.targetRoles.message}</p> : null}
                  </div>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Email content</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" {...register("subject")} />
                {errors.subject ? <p className="text-sm text-destructive">{errors.subject.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Message</Label>
                <Textarea id="body" rows={11} {...register("body")} />
                {errors.body ? <p className="text-sm text-destructive">{errors.body.message}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Available placeholders: {REMINDER_PLACEHOLDERS.map((key) => `{{${key}}}`).join(", ")}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="actionLabel">Button text</Label>
                  <Input id="actionLabel" placeholder="Open IRIS" {...register("actionLabel")} />
                  {errors.actionLabel ? <p className="text-sm text-destructive">{errors.actionLabel.message}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actionUrl">Button link</Label>
                  <Input id="actionUrl" placeholder="/training" {...register("actionUrl")} />
                  {errors.actionUrl ? <p className="text-sm text-destructive">{errors.actionUrl.message}</p> : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="replyTo">Reply-to email</Label>
                <Input id="replyTo" type="email" placeholder="hr@irs.com.my" {...register("replyTo")} />
                <p className="text-xs text-muted-foreground">Optional. Replies otherwise go to the configured sender.</p>
                {errors.replyTo ? <p className="text-sm text-destructive">{errors.replyTo.message}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <Card>
            <CardHeader><CardTitle>Email preview</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border bg-white text-zinc-900 shadow-sm">
                <div className="bg-zinc-900 px-5 py-4 text-lg font-bold text-white">IRIS</div>
                <div className="space-y-4 p-5 text-sm">
                  <p className="font-semibold">{interpolateReminder(watchedSubject || "Email subject", context)}</p>
                  <div className="whitespace-pre-wrap leading-6">
                    {interpolateReminder(watchedBody || "Email message", context)}
                  </div>
                  {watchedActionLabel ? (
                    <span className="inline-block rounded-md bg-orange-600 px-4 py-2 font-medium text-white">
                      {interpolateReminder(watchedActionLabel, context)}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {message ? (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertTitle>{message.type === "error" ? "Could not complete that" : "Done"}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSaving || isTesting}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save reminder
        </Button>
        <Button type="button" variant="outline" onClick={onTest} disabled={isSaving || isTesting}>
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          Send test to me
        </Button>
      </div>
    </form>
  );
}
