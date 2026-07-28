import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TARGETS, type Targets } from "@/lib/utils/targets";

/**
 * Learning-hour targets. Falls back to the documented defaults if the settings
 * row is unreadable, so a settings problem degrades the numbers rather than
 * taking every page down.
 */
export async function getTargets(): Promise<Targets> {
  const supabase = createClient();

  const { data } = await supabase
    .from("app_settings")
    .select(
      "monthly_standard_hours, yearly_standard_hours, yearly_threshold_hours, submission_deadline_day",
    )
    .maybeSingle();

  if (!data) return DEFAULT_TARGETS;

  return {
    monthlyStandardHours: data.monthly_standard_hours,
    yearlyStandardHours: data.yearly_standard_hours,
    yearlyThresholdHours: data.yearly_threshold_hours,
    submissionDeadlineDay: data.submission_deadline_day,
  };
}
