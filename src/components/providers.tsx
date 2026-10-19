"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { isPending } from "@/lib/format";
import type { ResultItem } from "@/lib/results";

export interface Me {
  user: { id: string; login: string; name: string | null; avatar_url: string | null } | null;
  share?: { id: string; display_name: string; public: boolean } | null;
  leaderboard?: { visibility: "github" | "name" | "hidden"; name: string | null; country: string | null };
  tour_completed: boolean;
  dev_login: boolean;
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
}

interface ResultsValue {
  items: ResultItem[];
  loaded: boolean;
  pending: number;
  /** Items that finished scoring since the page loaded (for toasts). */
  justFinished: ResultItem[];
  dismiss: (attemptId: string) => void;
  refresh: () => Promise<void>;
}

const SessionCtx = createContext<SessionValue>({ me: null, loading: true, reload: async () => {} });
const ResultsCtx = createContext<ResultsValue>({
  items: [],
  loaded: false,
  pending: 0,
  justFinished: [],
  dismiss: () => {},
  refresh: async () => {},
});

export const useSession = () => useContext(SessionCtx);
export const useResults = () => useContext(ResultsCtx);

function ResultsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [items, setItems] = useState<ResultItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [justFinished, setJustFinished] = useState<ResultItem[]>([]);
  const prev = useRef<Map<string, ResultItem["phase"]>>(new Map());
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inflight.current) return;
    inflight.current = true;
    try {
      const data = await api<{ items: ResultItem[]; pending: number }>("/api/me/results");
      const finished = data.items.filter((i) => {
        const before = prev.current.get(i.attempt_id);
        return before !== undefined && isPending(before) && (i.phase === "resolved" || i.phase === "unresolved");
      });
      if (finished.length) setJustFinished((cur) => [...finished, ...cur].slice(0, 4));
      prev.current = new Map(data.items.map((i) => [i.attempt_id, i.phase]));
      setItems(data.items);
      setLoaded(true);
    } catch {
      // Transient; the next poll will try again.
    } finally {
      inflight.current = false;
    }
  }, [enabled]);

  const pending = items.filter((i) => isPending(i.phase)).length;

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || pending === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [enabled, pending, refresh]);

  const dismiss = useCallback((attemptId: string) => {
    setJustFinished((cur) => cur.filter((i) => i.attempt_id !== attemptId));
  }, []);

  const value = useMemo(
    () => ({ items, loaded, pending, justFinished, dismiss, refresh }),
    [items, loaded, pending, justFinished, dismiss, refresh],
  );
  return <ResultsCtx value={value}>{children}</ResultsCtx>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe({ user: null, tour_completed: false, dev_login: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/api/me")
      .then((m) => !cancelled && setMe(m))
      .catch(() => !cancelled && setMe({ user: null, tour_completed: false, dev_login: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const session = useMemo(() => ({ me, loading, reload }), [me, loading, reload]);
  return (
    <SessionCtx value={session}>
      <ResultsProvider enabled={Boolean(me?.user)}>{children}</ResultsProvider>
    </SessionCtx>
  );
}
