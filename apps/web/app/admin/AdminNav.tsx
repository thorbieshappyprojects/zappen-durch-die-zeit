import { adminCounts } from "@zdz/db";
import Link from "next/link";
import { db } from "@/lib/db";
import { logout } from "./auth-actions";

const ITEMS = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/beitraege", label: "Beiträge", count: "contributionsPending" },
  { href: "/admin/meldungen", label: "Meldungen", count: "reportsOpen" },
  { href: "/admin/gesperrt", label: "Gesperrt", count: "blocked" },
  { href: "/admin/zwischenspiele", label: "Zwischenspiele" },
  { href: "/admin/aussortiert", label: "Aussortiert" },
] as const;

/** The admin navigation of every admin page, with the current page marked and open counts. */
export async function AdminNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  const counts = await adminCounts((await db()).db);
  return (
    <nav className="contrib-tabs admin-nav" aria-label="Admin">
      {ITEMS.map((item) => {
        const n = "count" in item ? counts[item.count] : 0;
        const label = `${item.label}${n ? ` (${n})` : ""}`;
        return item.href === current ? (
          <span key={item.href} className="btn on" aria-current="page">
            {label}
          </span>
        ) : (
          <Link key={item.href} className="btn" href={item.href}>
            {label}
          </Link>
        );
      })}
      <form action={logout}>
        <button className="btn">Abmelden</button>
      </form>
    </nav>
  );
}
