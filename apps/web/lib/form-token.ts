"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Tokens are rejected after 24 h; a page left open renews its token well before that. */
const REFRESH_AFTER_MS = 6 * 3600_000;
const CHECK_EVERY_MS = 10 * 60_000;

export async function fetchFormToken(): Promise<string> {
  const res = await fetch("/formular-token", { cache: "no-store" });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/**
 * The signed form token (lib/contribution-security), renewed when it is older than 6 h: on a timer
 * and when the tab becomes visible again. Never fetched at submit time, so the minimum fill time
 * still measures the person, not the request. `refresh` gets a new one right away (expired answer).
 */
export function useFormToken(initial: string): { token: string; refresh: () => Promise<string> } {
  const [token, setToken] = useState(initial);
  const receivedAt = useRef(0);
  const refresh = useCallback(async () => {
    const fresh = await fetchFormToken();
    receivedAt.current = Date.now();
    setToken(fresh);
    return fresh;
  }, []);
  useEffect(() => {
    // The initial token came with the page.
    receivedAt.current = Date.now();
    const check = () => {
      if (Date.now() - receivedAt.current > REFRESH_AFTER_MS) void refresh().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const id = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { token, refresh };
}
