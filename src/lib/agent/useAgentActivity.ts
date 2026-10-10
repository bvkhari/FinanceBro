"use client";

import { useEffect, useState } from "react";
import { AgentActivity, fetchAgentActivity, subscribeToAgentActivity } from "../db";

/** What WorkBuddy's agents have done on this profile, newest first, kept live. */
export function useAgentActivity(profileId: string | undefined) {
  const [items, setItems] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    const load = () =>
      fetchAgentActivity(profileId)
        .then((rows) => alive && (setItems(rows), setError(null)))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => alive && setLoading(false));
    setLoading(true);
    load();
    const unsubscribe = subscribeToAgentActivity(profileId, load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [profileId]);

  return { items, loading, error };
}
