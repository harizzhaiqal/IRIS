import { LoadingPanel } from "@/components/app-shell/loading-panel";

/**
 * Fallback for routes outside the app shell — the login screen and the root
 * redirect. The shell's own loading.tsx takes precedence for everything under
 * (app).
 */
export default function RootLoading() {
  return <LoadingPanel />;
}
