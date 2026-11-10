"use client";

/**
 * Error in the root layout itself: replaces the whole document, without the global styles, so it
 * carries its own few inline styles. "Bildstörung", no technical details.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#1a1410", color: "#f3e9d2", fontFamily: "system-ui, sans-serif" }}>
        <title>Bildstörung – Zappen durch die Zeit</title>
        <main style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontFamily: "monospace", color: "#ffd77a" }}>Bildstörung</h1>
          <p>Hier ist gerade etwas schiefgegangen. Bitte versuch es gleich noch einmal.</p>
          <p>
            <button type="button" onClick={() => retry()} style={{ font: "inherit", padding: "8px 16px", cursor: "pointer" }}>
              Noch einmal versuchen
            </button>{" "}
            {/* A full page load on purpose: the app itself crashed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#ffd77a" }}>
              Zum Fernseher
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
