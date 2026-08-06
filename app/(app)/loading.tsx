import { LoadingPanel } from "@/components/app-shell/loading-panel";

/**
 * Shown while any page inside the app shell is loading.
 *
 * Next renders this automatically whenever a route in this group suspends, so
 * every navigation is covered without the pages knowing about it.
 */
export default function AppLoading() {
  return <LoadingPanel />;
}
