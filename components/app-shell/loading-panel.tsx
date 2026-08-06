import { IrisSpinner } from "@/components/brand/iris-spinner";

/**
 * The full-screen loading panel, shared by route transitions and actions.
 *
 * Fixed to the viewport rather than centred inside the content column: inside
 * the app shell the column is offset by the 240px sidebar, so a panel centred
 * there sits noticeably right of the screen's middle.
 */
export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      aria-busy="true"
    >
      {/* One live region around mark and caption: the mark is decorative, the
          caption is the announcement. */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-7"
      >
        <IrisSpinner size={112} />
        <p className="text-base text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
