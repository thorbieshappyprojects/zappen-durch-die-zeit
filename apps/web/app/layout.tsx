import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter, VT323 } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-inter" });
const vt323 = VT323({ subsets: ["latin"], weight: "400", variable: "--font-vt323" });

const description =
  "Was lief damals? Deutsches Fernsehen wie vor über 30 Jahren – zur gleichen Uhrzeit wie jetzt. Einfach einschalten und durchzappen.";

export const metadata: Metadata = {
  // Absolute URLs for link previews (og:image, og:url); SITE_URL is required in production (instrumentation.ts).
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Zappen durch die Zeit",
  description,
  // Default share image: the general teletext card (day pages bring their own).
  openGraph: { title: "Zappen durch die Zeit", description, locale: "de_DE", type: "website", images: ["/og"] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request: the CSP nonce (proxy.ts) only reaches dynamic pages.
  await connection();
  return (
    <html lang="de" className={`${inter.variable} ${vt323.variable}`}>
      <body>{children}</body>
    </html>
  );
}
