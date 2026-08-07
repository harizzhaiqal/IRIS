import type {
  RequestCategory,
  RequestPriority,
} from "@/lib/types";

/**
 * The "Suggest with AI" engine.
 *
 * Deliberately deterministic keyword matching rather than a model call. For a
 * prototype that is the better trade: it costs nothing, needs no key, cannot
 * rate-limit during a demo, and — the part that matters most here — it is
 * testable, so the suggestions it makes are pinned by unit tests rather than
 * re-rolled on every run.
 *
 * Swapping in a real model later means replacing this one pure function; the
 * form, the stored `ai_suggestion` column, and the shape below stay as they are.
 */

export type RequestSuggestion = {
  category: RequestCategory;
  department: string;
  priority: RequestPriority;
  reason: string;
};

type Rule = { category: RequestCategory; keywords: string[] };

/**
 * Order matters. "Laptop repair" is an IT request, not a maintenance one, so
 * the equipment rules are consulted before the building rules — the first match
 * wins rather than the longest.
 */
const CATEGORY_RULES: Rule[] = [
  {
    category: "access_card",
    keywords: ["access card", "door access", "access pass", "security pass"],
  },
  {
    category: "name_card",
    keywords: ["name card", "business card", "namecard", "calling card"],
  },
  {
    category: "software",
    keywords: [
      "software", "install", "licence", "license", "app ", "application",
      "subscription", "ide", "plugin",
    ],
  },
  {
    category: "it_equipment",
    keywords: [
      "monitor", "laptop", "keyboard", "mouse", "printer", "computer",
      "desktop", "headset", "webcam", "docking", "hard disk", "ram",
    ],
  },
  {
    category: "office_furniture",
    keywords: ["chair", "table", "desk", "cabinet", "shelf", "drawer"],
  },
  {
    category: "maintenance",
    keywords: [
      "aircond", "air cond", "air-cond", "light", "lamp", "maintenance",
      "repair office", "plumbing", "leak", "ceiling", "toilet", "wiring",
    ],
  },
  {
    category: "office_equipment",
    keywords: [
      "stationery", "marker", "sticky note", "whiteboard", "paper",
      "pen", "notebook", "file", "folder",
    ],
  },
];

const URGENT_KEYWORDS = [
  "urgent", "broken", "cannot work", "can not work", "can't work",
  "down", "safety", "emergency", "immediately", "asap",
];

const HIGH_KEYWORDS = [
  "repair", "replacement", "replace", "damaged", "faulty", "fault",
  "access issue", "not working", "stopped working", "jams",
];

const LOW_KEYWORDS = [
  "nice to have", "nice-to-have", "when possible", "no rush",
  "not urgent", "whenever", "someday", "would be good",
];

/** Which team picks the request up. */
const DEPARTMENT_BY_CATEGORY: Record<RequestCategory, string> = {
  it_equipment: "IT",
  software: "IT",
  office_furniture: "Admin",
  access_card: "Admin",
  name_card: "Admin",
  office_equipment: "Admin",
  maintenance: "Facilities",
  other: "Admin",
};

const PRIORITY_REASONS: Record<RequestPriority, string> = {
  urgent: "The wording suggests work is blocked, so this is raised as urgent.",
  high: "A repair or replacement, which is handled ahead of routine requests.",
  normal: "A standard equipment or office item request.",
  low: "Described as non-urgent, so it can wait for the next cycle.",
};

function matches(haystack: string, keywords: string[]): boolean {
  return keywords.some((word) => haystack.includes(word));
}

function suggestCategory(text: string): RequestCategory {
  for (const rule of CATEGORY_RULES) {
    if (matches(text, rule.keywords)) return rule.category;
  }
  return "other";
}

function suggestPriority(text: string): RequestPriority {
  // Checked most severe first: "broken and cannot work, please repair" is
  // urgent, and the presence of "repair" must not pull it back down to high.
  if (matches(text, URGENT_KEYWORDS)) return "urgent";
  if (matches(text, HIGH_KEYWORDS)) return "high";
  if (matches(text, LOW_KEYWORDS)) return "low";
  return "normal";
}

/**
 * Reads a free-text description and proposes how the request should be filed.
 * Everything it returns is a suggestion: the form pre-fills from it and the
 * requester remains free to overrule any field.
 */
export function suggestRequest(description: string): RequestSuggestion {
  // Padded so a keyword ending in a space, like "app ", still matches a
  // description that ends on that word.
  const text = ` ${description.toLowerCase().trim()} `;

  const category = suggestCategory(text);
  const priority = suggestPriority(text);

  return {
    category,
    department: DEPARTMENT_BY_CATEGORY[category],
    priority,
    reason: PRIORITY_REASONS[priority],
  };
}
