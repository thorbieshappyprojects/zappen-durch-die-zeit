"use client";

import { useCallback, useSyncExternalStore } from "react";

// v2: covers all video providers (YouTube, Dailymotion, Internet Archive, Vimeo), so it is asked again.
const KEY = "zdz-video-consent-v2";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "granted";
  } catch {
    return false;
  }
}

function write(granted: boolean) {
  try {
    if (granted) localStorage.setItem(KEY, "granted");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: consent then only lasts for this page view.
    memoryConsent = granted;
  }
  listeners.forEach((l) => l());
}

let memoryConsent = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Click-to-load consent for embedded videos, remembered per browser. */
export function useVideoConsent() {
  const granted = useSyncExternalStore(subscribe, () => read() || memoryConsent, () => false);
  const grant = useCallback(() => write(true), []);
  const revoke = useCallback(() => {
    memoryConsent = false;
    write(false);
  }, []);
  return { granted, grant, revoke };
}
