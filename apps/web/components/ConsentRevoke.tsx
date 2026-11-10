"use client";

import { useVideoConsent } from "@/lib/consent";

export function ConsentRevoke() {
  const consent = useVideoConsent();
  return consent.granted ? (
    <button className="btn" onClick={consent.revoke}>
      Video-Einwilligung widerrufen
    </button>
  ) : (
    <span>Du hast der Video-Wiedergabe in diesem Browser derzeit nicht zugestimmt.</span>
  );
}
