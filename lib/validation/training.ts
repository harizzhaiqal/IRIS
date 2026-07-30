import { z } from "zod";

import { calculateMinutes, hhmmToMinutes } from "@/lib/utils/duration";

const MAX_ENTRY_MINUTES = 60 * 24 * 31;

export const periodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const trainingEntrySchema = z
  .object({
    // Coerced: this arrives as a string from the ?recordId= query param and
    // from form data, but the column is an integer identity.
    recordId: z.coerce.number().int().positive().optional(),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    title: z
      .string()
      .trim()
      .min(3, "Give the training a title of at least 3 characters")
      .max(200, "Keep the title under 200 characters"),
    startDatetime: z.string().min(1, "Choose when the training started"),
    endDatetime: z.string().min(1, "Choose when the training ended"),
    recordedMinutes: z
      .number()
      .int()
      .min(1, "Recorded hours must be more than zero")
      .max(MAX_ENTRY_MINUTES, "That is longer than a month"),
    overrideReason: z
      .string()
      .trim()
      .max(500, "Keep the reason under 500 characters")
      .nullish(),
    location: z.string().trim().max(200).nullish(),
    trainerProvider: z.string().trim().max(200).nullish(),
    effectiveness: z
      .enum(["effective", "average", "not_effective"])
      .nullish(),
    remarks: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (value) => {
      const start = new Date(value.startDatetime);
      const end = new Date(value.endDatetime);
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        end > start
      );
    },
    { message: "The end must come after the start", path: ["endDatetime"] },
  )
  .refine(
    (value) => {
      const start = new Date(value.startDatetime);
      const end = new Date(value.endDatetime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return true;
      }

      const calculated = calculateMinutes(start, end);
      if (calculated === value.recordedMinutes) return true;

      return Boolean(value.overrideReason && value.overrideReason.length > 0);
    },
    {
      message:
        "Give a reason for recording hours different from the calculated duration",
      path: ["overrideReason"],
    },
  )
  .refine(
    (value) => {
      const start = new Date(value.startDatetime);
      if (Number.isNaN(start.getTime())) return true;

      return (
        start.getMonth() + 1 === value.month && start.getFullYear() === value.year
      );
    },
    {
      message: "The training must start within the month you are recording",
      path: ["startDatetime"],
    },
  );

export type TrainingEntryInput = z.infer<typeof trainingEntrySchema>;

/**
 * The same rules expressed over the raw form fields, where hours are typed as
 * HH:MM rather than minutes. The server re-checks the converted payload with
 * trainingEntrySchema, so neither side trusts the other.
 */
export const trainingEntryFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the training a title of at least 3 characters")
      .max(200, "Keep the title under 200 characters"),
    startDatetime: z.string().min(1, "Choose when the training started"),
    endDatetime: z.string().min(1, "Choose when the training ended"),
    hours: z
      .string()
      .refine((value) => {
        const minutes = hhmmToMinutes(value);
        return minutes !== null && minutes > 0;
      }, "Enter hours as HH:MM, for example 07:30"),
    overrideReason: z.string().trim().max(500).optional(),
    location: z.string().trim().max(200).optional(),
    trainerProvider: z.string().trim().max(200).optional(),
    effectiveness: z.enum(["effective", "average", "not_effective"]).optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) => {
      const start = new Date(value.startDatetime);
      const end = new Date(value.endDatetime);
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        end > start
      );
    },
    { message: "The end must come after the start", path: ["endDatetime"] },
  )
  .refine(
    (value) => {
      const recorded = hhmmToMinutes(value.hours);
      if (recorded === null) return true;

      const calculated = calculateMinutes(value.startDatetime, value.endDatetime);
      if (calculated === recorded) return true;

      return Boolean(value.overrideReason && value.overrideReason.trim());
    },
    {
      message:
        "Give a reason for recording hours different from the calculated duration",
      path: ["overrideReason"],
    },
  );

export type TrainingEntryFormValues = z.infer<typeof trainingEntryFormSchema>;

export const attachmentSchema = z.object({
  recordId: z.coerce.number().int().positive(),
  filePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(0),
});

/** An attachment id from a route segment, so a hand-edited path is rejected. */
export const idParamSchema = z.coerce.number().int().positive();

export const reviewDecisionSchema = z
  .object({
    // Coerced for the same reason as recordId: the review page passes the id
    // through the URL, where everything is a string.
    submissionId: z.coerce.number().int().positive(),
    decision: z.enum(["verify", "return", "approve", "reject"]),
    comment: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (value) =>
      !["return", "reject"].includes(value.decision) ||
      Boolean(value.comment && value.comment.length > 0),
    {
      message: "Explain what needs to change before sending this back",
      path: ["comment"],
    },
  );

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
