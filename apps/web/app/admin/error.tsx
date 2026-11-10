"use client";

import Link from "next/link";

/** Admin pages: the moderator sees the error message (server errors: the digest to find it in the log). */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest) : null;
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Fehler</h1>
        <nav className="contrib-tabs">
          <Link className="btn" href="/admin">
            Übersicht
          </Link>
        </nav>
      </header>
      <p className="contrib-errors" role="alert">
        {message}
        {digest && <small> (Kennung im Server-Log: {digest})</small>}
      </p>
      <button type="button" className="play" onClick={() => retry()}>
        Noch einmal versuchen
      </button>
    </div>
  );
}
