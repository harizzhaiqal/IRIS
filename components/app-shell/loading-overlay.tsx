"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { LoadingPanel } from "@/components/app-shell/loading-panel";

/**
 * A single blocking overlay shared by every action in the app.
 *
 * Two details that matter more than they look:
 *
 * 1. Pending state is a *counter*, not a boolean. Two actions can overlap —
 *    approving a row while a filter refetches — and with a boolean the first
 *    one to finish would hide the overlay while the second was still running.
 * 2. Nothing renders for the first `SHOW_DELAY_MS`. Most actions here finish in
 *    well under that, and an overlay that flashes for 80ms reads as a glitch
 *    rather than as feedback.
 */

const SHOW_DELAY_MS = 300;

type LoadingContextValue = {
  /** Returns a release function. Call it when the work finishes. */
  begin: (label?: string) => () => void;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState<string | undefined>(undefined);
  const [visible, setVisible] = useState(false);

  const begin = useCallback((next?: string) => {
    setCount((n) => n + 1);
    if (next) setLabel(next);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      setCount((n) => Math.max(0, n - 1));
    };
  }, []);

  useEffect(() => {
    if (count === 0) {
      setVisible(false);
      setLabel(undefined);
      return;
    }

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [count]);

  const value = useMemo(() => ({ begin }), [begin]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {visible ? <Overlay label={label} /> : null}
    </LoadingContext.Provider>
  );
}

/* Same panel the route transitions use, so an action and a navigation look
   identical — blocking a second click is a side effect of it covering the
   viewport, which is also the point. */
function Overlay({ label }: { label?: string }) {
  return <LoadingPanel label={label ?? "Working…"} />;
}

/**
 * Mirrors a local pending flag into the shared overlay.
 *
 * Most call sites already track their own `useTransition` pending state, so
 * this is a one-line addition rather than a rewrite:
 *
 *   const [pending, startTransition] = useTransition();
 *   useGlobalPending(pending, "Saving entry…");
 */
export function useGlobalPending(active: boolean, label?: string) {
  const ctx = useContext(LoadingContext);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ctx) return;

    if (active && !releaseRef.current) {
      releaseRef.current = ctx.begin(label);
    } else if (!active && releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  }, [active, label, ctx]);

  // A component can unmount mid-flight — a row action that removes its own
  // row, for instance. Without this the counter would never come back down.
  useEffect(() => {
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);
}
