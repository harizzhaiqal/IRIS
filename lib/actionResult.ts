/**
 * The shape every server action returns.
 *
 * Extracted here when the Requests module needed the same thing the Training
 * module already had. Training still declares its own copy; moving it over is a
 * change to the finished module and is deliberately not bundled with new work.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export function failed(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
