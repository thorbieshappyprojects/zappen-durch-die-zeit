import Link from "next/link";

/** Entries per admin list page (?seite=). */
export const PAGE_SIZE = 50;

/** The requested page, clamped to the pages there are (1-based). */
export function pageOf(seite: string | undefined, total: number): number {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const n = Number(seite);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, last) : 1;
}

/** "‹ Seite 2 von 5 ›" – nothing when everything fits on one page. */
export function Pager({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  const last = Math.ceil(total / PAGE_SIZE);
  if (last <= 1) return null;
  return (
    <nav className="admin-pager" aria-label="Seiten">
      {page > 1 ? <Link className="btn" href={href(page - 1)}>‹ zurück</Link> : <span className="btn off">‹ zurück</span>}
      <span>
        Seite {page} von {last} ({total} Einträge)
      </span>
      {page < last ? <Link className="btn" href={href(page + 1)}>weiter ›</Link> : <span className="btn off">weiter ›</span>}
    </nav>
  );
}
