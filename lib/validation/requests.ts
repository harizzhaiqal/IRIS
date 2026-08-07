import { z } from "zod";

import { parseCostToCents } from "@/lib/utils/money";

const CATEGORIES = [
  "it_equipment",
  "office_furniture",
  "software",
  "access_card",
  "name_card",
  "office_equipment",
  "maintenance",
  "other",
] as const;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/**
 * The form's own shape, validated in the browser. Cost stays a string here
 * because that is what the input holds; it becomes integer cents at the
 * boundary below.
 */
export const requestFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give the request a title of at least 3 characters")
    .max(200, "Keep the title under 200 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Describe what you need in at least 10 characters")
    .max(2000, "Keep the description under 2000 characters"),
  category: z.enum(CATEGORIES),
  estimatedCost: z
    .string()
    .refine((value) => value.trim() === "" || parseCostToCents(value) !== null, {
      message: "Enter a cost like 890 or 890.50, or leave it blank",
    }),
  priority: z.enum(PRIORITIES),
  assignedDepartment: z
    .string()
    .trim()
    .max(80, "Keep the department under 80 characters"),
});

export type RequestFormValues = z.infer<typeof requestFormSchema>;

/** What the server accepts. Cost has become cents by this point. */
export const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORIES),
  estimatedCostCents: z.number().int().min(0).max(100_000_000),
  priority: z.enum(PRIORITIES),
  assignedDepartment: z.string().trim().max(80).nullable(),
  attachmentPath: z.string().max(500).nullable().optional(),
  attachmentName: z.string().max(255).nullable().optional(),
  aiSuggestion: z
    .object({
      category: z.enum(CATEGORIES),
      department: z.string(),
      priority: z.enum(PRIORITIES),
      reason: z.string(),
    })
    .nullable()
    .optional(),
});

export const requestDecisionSchema = z
  .object({
    requestId: z.coerce.number().int().positive(),
    decision: z.enum(["approve", "reject", "start", "complete"]),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.decision !== "reject" ||
      (value.comment !== undefined && value.comment.length > 0),
    {
      message: "Give a reason when rejecting a request",
      path: ["comment"],
    },
  );

export const requestCommentSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  body: z
    .string()
    .trim()
    .min(1, "Write a comment before adding it")
    .max(1000, "Keep the comment under 1000 characters"),
});

export const suggestionInputSchema = z.object({
  description: z.string().trim().min(1).max(2000),
});
