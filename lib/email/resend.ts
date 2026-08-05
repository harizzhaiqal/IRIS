import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey: string;
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

export function emailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM_EMAIL);
}

export async function sendReminderEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      error:
        "Email delivery is not configured. Add RESEND_API_KEY and REMINDER_FROM_EMAIL to the server environment.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok || !payload?.id) {
      return {
        ok: false,
        error:
          payload?.message ??
          `The email provider returned ${response.status} ${response.statusText}`,
      };
    }

    return { ok: true, providerMessageId: payload.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email delivery failed",
    };
  }
}
