import Link from "next/link";
import { SiteFooter } from "./LegalLinks";

/**
 * Full page for "nothing to show here" (404, no programme, picture fault): a small test card with a
 * label, a headline, a text and links back. No hooks, so error boundaries can use it too.
 */
export function StatusPage({
  label,
  title,
  children,
  links,
}: {
  label: string;
  title: string;
  children?: React.ReactNode;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="wrap status-page">
      <header className="page-header">
        <h1>
          <Link href="/">Zappen durch die Zeit</Link>
        </h1>
      </header>
      <div className="status-card">
        <div className="testbild" role="img" aria-label={label}>
          <div className="bars">
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="lbl">{label}</div>
        </div>
      </div>
      <h2>{title}</h2>
      {children}
      <nav className="status-links">
        {links.map((l) => (
          <Link key={l.href + l.label} className="btn" href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
      <SiteFooter />
    </div>
  );
}
