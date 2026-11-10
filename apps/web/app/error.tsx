"use client";

import { StatusPage } from "@/components/StatusPage";

/** Unexpected error on a page: "Bildstörung", no technical details (they are in the server log). */
export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <StatusPage label="BILDSTÖRUNG" title="Bildstörung" links={[{ href: "/", label: "Zum Fernseher" }]}>
      <p>Hier ist gerade etwas schiefgegangen. Bitte versuch es gleich noch einmal.</p>
      <p>
        <button type="button" className="play" onClick={() => retry()}>
          Noch einmal versuchen
        </button>
      </p>
    </StatusPage>
  );
}
