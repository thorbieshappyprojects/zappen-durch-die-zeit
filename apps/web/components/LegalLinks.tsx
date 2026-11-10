import Link from "next/link";

/** „Impressum · Datenschutz": on every page, one click away (the TV has them in its header). */
export function LegalLinks({ className = "legal-links" }: { className?: string }) {
  return (
    <span className={className}>
      <Link href="/impressum">Impressum</Link>
      <span aria-hidden> · </span>
      <Link href="/datenschutz">Datenschutz</Link>
    </span>
  );
}

/** Footer for the text pages (Info, Mitmachen, day listing, status pages). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <LegalLinks />
    </footer>
  );
}
