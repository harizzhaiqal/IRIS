import { z } from "zod";

import { unsupportedPlaceholders } from "@/lib/reminders/template";

const TARGET_ROLES = ["staff", "hod"] as const;

const templateText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maximum, `${label} must be ${maximum} characters or fewer`)
    .refine((value) => unsupportedPlaceholders(value).length === 0, {
      message: `Unsupported placeholder. Use full_name, month_name, year, deadline_date, or iris_url`,
    });

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum);

export const reminderFormSchema = z
  .object({
    reminderId: z.number().int().positive().nullable(),
    name: z
      .string()
      .trim()
      .min(3, "Give this reminder a name")
      .max(100, "Keep the name under 100 characters"),
    isEnabled: z.boolean(),
    dayOfMonth: z.number().int().min(1).max(28),
    sendTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid sending time"),
    timezone: z.literal("Asia/Kuala_Lumpur"),
    audience: z.enum(["all_active_employees", "incomplete_training"]),
    targetRoles: z
      .array(z.enum(TARGET_ROLES))
      .min(1, "Select Staff, HOD, or both"),
    subject: templateText("Subject", 200),
    body: templateText("Message", 5000),
    actionLabel: optionalText(60),
    actionUrl: optionalText(1000).refine(
      (value) =>
        value === null ||
        value.startsWith("/") ||
        /^https:\/\//i.test(value) ||
        /^http:\/\/localhost(?::\d+)?(?:\/|$)/i.test(value),
      "Use an IRIS path such as /training or a full HTTPS address",
    ),
    replyTo: z
      .string()
      .trim()
      .max(320)
      .refine(
        (value) => value === "" || z.string().email().safeParse(value).success,
        "Enter a valid reply-to email address",
      ),
  })
  .superRefine((value, context) => {
    const hasLabel = value.actionLabel !== "";
    const hasUrl = value.actionUrl !== "";
    if (hasLabel !== hasUrl) {
      context.addIssue({
        code: "custom",
        path: hasLabel ? ["actionUrl"] : ["actionLabel"],
        message: "Button text and button link must be provided together",
      });
    }
  });

export type ReminderFormValues = z.input<typeof reminderFormSchema>;
export type ReminderInput = z.output<typeof reminderFormSchema>;

export const reminderRunIdSchema = z.coerce.number().int().positive();
