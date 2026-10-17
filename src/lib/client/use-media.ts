"use client";

import { useCallback, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it to keep client-only state
 * (session, viewport) out of the first render so it always matches the server HTML.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/** Live `matchMedia` result; null on the server and during hydration. */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
