import { createClient } from "@/lib/supabase/server";
import type {
  ReminderDelivery,
  ReminderRun,
  ReminderSchedule,
} from "@/lib/types";

export async function listReminderSchedules(): Promise<ReminderSchedule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reminder_schedules")
    .select("*")
    .order("name");

  if (error) throw new Error(`Could not load reminders: ${error.message}`);
  return data ?? [];
}

export async function getReminderSchedule(
  id: number,
): Promise<ReminderSchedule | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reminder_schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load this reminder: ${error.message}`);
  return data ?? null;
}

export async function listReminderRuns(limit = 20): Promise<ReminderRun[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reminder_runs")
    .select("*")
    .order("scheduled_for", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load reminder history: ${error.message}`);
  return data ?? [];
}

export async function getReminderRun(id: number): Promise<ReminderRun | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reminder_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load this reminder run: ${error.message}`);
  return data ?? null;
}

export async function listReminderDeliveries(
  runId: number,
): Promise<ReminderDelivery[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .select("*")
    .eq("run_id", runId)
    .order("recipient_name");

  if (error) throw new Error(`Could not load delivery details: ${error.message}`);
  return data ?? [];
}
