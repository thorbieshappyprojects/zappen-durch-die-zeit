import { StatusPage } from "@/components/StatusPage";

/** Unknown address or an invalid date: German, in the look of the test card. */
export default function NotFound() {
  return (
    <StatusPage label="KEIN EMPFANG" title="Diese Seite gibt es nicht" links={[{ href: "/", label: "Zum Fernseher" }]}>
      <p>Auf diesem Kanal kommt nichts. Vielleicht ein Tippfehler in der Adresse?</p>
    </StatusPage>
  );
}
