"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for an overlay (help, calendar, report form): focus moves in (to `initialFocus`
 * or the first control), Tab stays inside, Escape closes, and focus returns to where it was.
 * The element should carry role="dialog" and aria-modal="true" (the TV ignores its shortcuts then).
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  { open, onClose, initialFocus }: { open: boolean; onClose: () => void; initialFocus?: () => HTMLElement | null },
): void {
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocus?.() ?? root.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (returnTo?.isConnected) returnTo.focus();
    };
    // Only on opening and closing: onClose/initialFocus may change identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
